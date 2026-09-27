/**
 * Slack Web API — outbound replies for the Billing Advisor Agent's Slack DM
 * chat (services/slack/slack-chat-handler.ts). Separate from
 * services/notifications/slack.ts, which posts one-way alerts through a
 * user-pasted Incoming Webhook URL; this instead authenticates as the
 * installing organization's OWN bot user — a per-organization token (see
 * organization.model.ts's `slackWorkspace.botToken`), not a single global
 * one, since each customer organization connects its own separate Slack
 * workspace. Same project convention as everywhere else that talks to a
 * single documented REST endpoint: plain `fetch`, no `@slack/web-api`
 * dependency.
 */
import { AppError } from "@/utils/appError";

const SLACK_API_BASE = "https://slack.com/api";
const SEND_TIMEOUT_MS = 10_000;

/** Posts one plain-text message into a Slack channel/DM, authenticating as
 *  the given organization's own installed bot. */
export async function postSlackMessage(
  botToken: string,
  channel: string,
  text: string
): Promise<void> {
  if (!botToken) {
    throw new AppError("This workspace hasn't connected Slack yet.", 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !data?.ok) {
      throw new Error(`Slack chat.postMessage failed: ${data?.error ?? res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
