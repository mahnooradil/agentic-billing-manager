/**
 * Handles one inbound Slack DM event end-to-end: dedupe → resolve the
 * sender's linked app account (or walk them through linking one) → run the
 * same Billing Advisor Agent turn the web UI uses → reply in Slack.
 *
 * Entry point for `controllers/slack.controller.ts`'s Events webhook. Kept
 * separate from the controller so the controller stays a thin
 * verify-and-ACK layer (Slack needs a fast 200; this can take as long as an
 * Agent turn does — see slack.controller.ts for the fire-and-forget call).
 */
import { randomInt } from "node:crypto";

import { AppError } from "@/utils/appError";
import { assertCreditBalance } from "@/utils/credits";
import { User, type UserDocument } from "@/models/user.model";
import { SlackProcessedEvent } from "@/models/slack-processed-event.model";
import { resolveActiveOrganization } from "@/middlewares/auth.middleware";
import { sendAgentMessage, type AgentAction } from "@/services/agent/managed-agent.service";
import { postSlackMessage } from "@/services/slack/slack-web-api";

const LINK_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O, 1/I
const LINK_CODE_LENGTH = 6;
export const LINK_CODE_TTL_MINUTES = 10;

/** Generates and stores a fresh link code for a user's "Connect Slack" click. */
export async function generateSlackLinkCode(
  user: UserDocument
): Promise<{ code: string; expiresInMinutes: number }> {
  const code = Array.from(
    { length: LINK_CODE_LENGTH },
    () => LINK_CODE_CHARS[randomInt(LINK_CODE_CHARS.length)]
  ).join("");
  user.slackLinkCode = code;
  user.slackLinkCodeExpiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);
  await user.save();
  return { code, expiresInMinutes: LINK_CODE_TTL_MINUTES };
}

/** Atomically claims one event id via the model's unique index — returns
 *  false when it's a Slack retry of an event already handled. */
async function claimEvent(eventId: string): Promise<boolean> {
  try {
    await SlackProcessedEvent.create({ eventId });
    return true;
  } catch {
    return false;
  }
}

/** Matches a DM's text against a pending link code and, if valid and this
 *  Slack identity isn't already linked to someone else, completes the link. */
async function tryLinkByCode(slackUserId: string, rawText: string): Promise<boolean> {
  const code = rawText.trim().toUpperCase();
  if (!code) return false;

  const candidate = await User.findOne({
    slackLinkCode: code,
    slackLinkCodeExpiresAt: { $gt: new Date() },
  });
  if (!candidate) return false;

  const alreadyLinked = await User.findOne({ slackUserId });
  if (alreadyLinked) return false;

  candidate.slackUserId = slackUserId;
  candidate.slackLinkCode = undefined;
  candidate.slackLinkCodeExpiresAt = undefined;
  await candidate.save();
  return true;
}

/** Slack DMs get a plain-text hint instead of the app's clickable confirm
 *  button (building real Slack interactive buttons needs its own separate
 *  app configuration — out of scope for v1) — always point back to the app
 *  to actually complete a connect/update/delete action. */
function actionHint(action: AgentAction): string {
  switch (action.type) {
    case "connect_platform":
      return `🔗 *${action.displayName}* ko connect karne ke liye app kholein: Platforms → Connect.`;
    case "update_billing_status":
      return `📋 Invoice *${action.invoiceNumber}* (${action.customerName}) ko *${action.newStatus}* mark karne ke liye app ke Billing Agent chat mein confirm karein.`;
    case "delete_billing_record":
      return `🗑️ Invoice *${action.invoiceNumber}* (${action.customerName}) delete karne ke liye app ke Billing Agent chat mein confirm karein.`;
  }
}

export interface SlackMessageEvent {
  channel: string;
  user?: string;
  text?: string;
  bot_id?: string;
  subtype?: string;
}

export async function handleSlackChatEvent(
  eventId: string,
  event: SlackMessageEvent
): Promise<void> {
  const isNew = await claimEvent(eventId);
  if (!isNew) return; // Slack retry of an event we already handled

  // Ignore the bot's own messages and anything that isn't a plain human DM
  // (joins, edits, deletes, etc. all carry a `subtype`).
  if (!event.user || event.bot_id || event.subtype) return;

  const text = (event.text ?? "").trim();
  if (!text) return;

  try {
    const user = await User.findOne({ slackUserId: event.user });

    if (!user) {
      const linked = await tryLinkByCode(event.user, text);
      await postSlackMessage(
        event.channel,
        linked
          ? "✅ Connected! Ab aap yahan seedha Billing Advisor se baat kar sakte hain — koi bhi sawal poochein."
          : 'Mujhe abhi aapki pehchan nahi hui. App mein *Settings → Notifications* pe jaake "Connect Slack" dabayein, phir wahan mila code yahan bhej dein.'
      );
      return;
    }

    const { organization } = await resolveActiveOrganization(user);
    assertCreditBalance(organization);

    const { reply, action } = await sendAgentMessage(user._id, organization._id, text);
    await postSlackMessage(event.channel, action ? `${reply}\n\n${actionHint(action)}` : reply);
  } catch (err) {
    const message =
      err instanceof AppError ? err.message : "Mujhe jawab dete waqt masla hua, dobara try karein.";
    await postSlackMessage(event.channel, `⚠️ ${message}`).catch(() => {
      // Best-effort — if even the error reply fails, there's nothing else to do.
    });
  }
}
