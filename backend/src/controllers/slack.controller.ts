/**
 * Slack Events API entry point (`POST /api/slack/events`, mounted directly
 * in app.ts — NOT behind `authenticate`, since Slack has no Bearer token to
 * send; the request signature is the trust boundary instead, see
 * services/slack/slack-signature.ts) plus the one authenticated endpoint
 * that lets a logged-in user generate their own linking code.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { verifySlackSignature } from "@/services/slack/slack-signature";
import {
  generateSlackLinkCode,
  handleSlackChatEvent,
  type SlackMessageEvent,
} from "@/services/slack/slack-chat-handler";

interface SlackEventsPayload {
  type: "url_verification" | "event_callback";
  challenge?: string;
  event_id?: string;
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
  if (payload.type === "event_callback" && event?.type === "message" && event.channel_type === "im" && payload.event_id) {
    void handleSlackChatEvent(payload.event_id, event).catch(() => {
      // Best-effort — a failure here has nothing left to respond to; the
      // handler itself already tries to post a fallback message to Slack.
    });
  }
});

/** POST /api/slack/link-code — authenticated; issues a fresh short-lived
 *  code the user pastes into a DM with the bot to link their Slack account. */
export const createSlackLinkCode = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const { code, expiresInMinutes } = await generateSlackLinkCode(user);
  sendSuccess(res, 200, "Slack link code generated", { code, expiresInMinutes });
});
