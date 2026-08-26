/**
 * Slack Web API — outbound replies for the Billing Advisor Agent's Slack DM
 * chat (services/slack/slack-chat-handler.ts). Separate from
 * services/notifications/slack.ts, which posts one-way alerts through a
 * user-pasted Incoming Webhook URL; this instead authenticates as the app's
 * own bot user (`env.slackBotToken`) so it can reply into a specific DM
 * channel. Same project convention as everywhere else that talks to a single
 * documented REST endpoint: plain `fetch`, no `@slack/web-api` dependency.
 */
import { env } from "@/config/env";
import { AppError } from "@/utils/appError";

const SLACK_API_BASE = "https://slack.com/api";
const SEND_TIMEOUT_MS = 10_000;

export function isSlackBotConfigured(): boolean {
  return Boolean(env.slackBotToken && env.slackSigningSecret);
}

/** Posts one plain-text message into a Slack channel/DM as the app's bot. */
export async function postSlackMessage(channel: string, text: string): Promise<void> {
  if (!isSlackBotConfigured()) {
    throw new AppError("Slack chat isn't configured on this server yet.", 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.slackBotToken}`,
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
