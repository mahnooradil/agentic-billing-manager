/**
 * Slack Events API entry point (`POST /api/slack/events`, mounted directly
 * in app.ts — NOT behind `authenticate`, since Slack has no Bearer token to
 * send; the request signature is the trust boundary instead, see
 * services/slack/slack-signature.ts), the OAuth install flow ("Add to
 * Slack" — see services/slack/slack-oauth.service.ts), and the one
 * authenticated endpoint that lets a logged-in user generate their own
 * linking code for the active organization's connected workspace.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { env } from "@/config/env";
import { Organization } from "@/models/organization.model";
import { verifySlackSignature } from "@/services/slack/slack-signature";
import { getInstallUrl, handleOAuthCallback } from "@/services/slack/slack-oauth.service";
import {
  generateSlackLinkCode,
  handleSlackChatEvent,
  type SlackMessageEvent,
} from "@/services/slack/slack-chat-handler";

interface SlackEventsPayload {
  type: "url_verification" | "event_callback";
  challenge?: string;
  event_id?: string;
  /** Which Slack workspace this event is from — how we resolve which
   *  organization's own connection this belongs to (see slack-oauth.service.ts;
   *  each organization connects its own separate workspace). */
  team_id?: string;
  event?: SlackMessageEvent & { type?: string; channel_type?: string };
}

/** POST /api/slack/events — body is the RAW request bytes (see app.ts). */
export const slackEvents = asyncHandler(async (req, res) => {
  const rawBody = req.body as Buffer;
  const verified = verifySlackSignature({
    signature: req.headers["x-slack-signature"] as string | undefined,
    timestamp: req.headers["x-slack-request-timestamp"] as string | undefined,
    rawBody,
  });
  if (!verified) {
    throw new AppError("Invalid signature", 401);
  }

  let payload: SlackEventsPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as SlackEventsPayload;
  } catch {
    throw new AppError("Malformed payload", 400);
  }

  // One-time check Slack does when the Request URL is first saved — must
  // echo the challenge back verbatim, plain text, not the JSON envelope.
  if (payload.type === "url_verification") {
    res.status(200).type("text/plain").send(payload.challenge ?? "");
    return;
  }

  // ACK immediately — Slack retries the whole event if it doesn't see a 200
  // within a few seconds, and an Agent turn can easily take longer than that.
  res.status(200).send();

  const event = payload.event;
  if (
    payload.type === "event_callback" &&
    event?.type === "message" &&
    event.channel_type === "im" &&
    payload.event_id &&
    payload.team_id
  ) {
    void Organization.findOne({ "slackWorkspace.teamId": payload.team_id })
      .then((organization) => {
        // No organization has this workspace connected (uninstalled, or a
        // stale/forged team_id) — nothing to reply to, so just drop it.
        if (!organization) return;
        return handleSlackChatEvent(payload.event_id!, event, organization);
      })
      .catch(() => {
        // Best-effort — a failure here has nothing left to respond to; the
        // handler itself already tries to post a fallback message to Slack.
      });
  }
});

/** POST /api/slack/link-code — authenticated; issues a fresh short-lived
 *  code the user pastes into a DM with the bot to link their Slack account
 *  to the currently-active organization's connected workspace. */
export const createSlackLinkCode = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  if (!user || !organization) {
    throw new AppError("Authentication required", 401);
  }
  if (!organization.slackWorkspace) {
    throw new AppError("Connect this workspace to Slack first.", 400);
  }

  const { code, expiresInMinutes } = await generateSlackLinkCode(
    user,
    organization._id.toString()
  );
  sendSuccess(res, 200, "Slack link code generated", { code, expiresInMinutes });
});

/** GET /api/slack/status — authenticated; whether the ACTIVE organization
 *  has connected a Slack workspace yet, and its name if so. Lets the
 *  Settings tab decide whether to show "Add to Slack" or the link-code flow. */
export const getSlackStatus = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }
  sendSuccess(res, 200, "Slack status", {
    connected: Boolean(organization.slackWorkspace),
    teamName: organization.slackWorkspace?.teamName ?? null,
  });
});

/** GET /api/slack/install — authenticated; returns the Slack "Add to Slack"
 *  consent URL for the active organization. The frontend navigates the
 *  whole page there (same redirect pattern as Stripe Checkout), not a fetch. */
export const startSlackInstall = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }
  const url = getInstallUrl(organization._id.toString());
  sendSuccess(res, 200, "Slack install URL generated", { url });
});

/** GET /api/slack/oauth/callback — Slack redirects the ADMIN'S BROWSER here
 *  after they approve the install; NOT behind `authenticate` (Slack's
 *  redirect carries no Bearer token — the signed `state` param is the trust
 *  boundary, see slack-oauth.service.ts). Redirects on to the app's own
 *  Settings page with a result query param, mirroring Stripe Checkout's
 *  `?checkout=success|cancel` pattern. */
export const slackOAuthCallback = asyncHandler(async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const settingsUrl = `${env.corsOrigin}/dashboard/settings?tab=notifications`;

  if (!code || !state) {
    res.redirect(`${settingsUrl}&slack=error`);
    return;
  }

  try {
    await handleOAuthCallback(code, state);
    res.redirect(`${settingsUrl}&slack=connected`);
  } catch {
    res.redirect(`${settingsUrl}&slack=error`);
  }
});
