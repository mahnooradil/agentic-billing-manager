/**
 * Slack alerts. Two ways a workspace ends up with a webhook URL:
 *
 *  1. flow/extra-01's "Add to Slack" OAuth install requests the
 *     `incoming-webhook` scope in the same consent screen as the chat bot
 *     — `Organization.slackWorkspace.incomingWebhookUrl`, set automatically,
 *     no manual step.
 *  2. The OLDER path, kept as a fallback for anyone who already configured
 *     it that way before this existed: the user creates a Slack "Incoming
 *     Webhook" themselves (Slack App settings → Incoming Webhooks) and
 *     pastes the URL into Settings — `UserSettings.notifications.
 *     slackWebhookUrl`, validated at the settings layer (see
 *     user-settings.validator.ts) to be exactly
 *     `https://hooks.slack.com/...`, so this never ends up POSTing to an
 *     arbitrary/internal address.
 *
 * `resolveSlackWebhookUrl` below is the one place that decides which of
 * the two actually gets used. Matches this project's convention (see
 * services/email/resend.ts) of a single plain `fetch` call instead of
 * pulling in an SDK for one documented REST call.
 */
const SEND_TIMEOUT_MS = 10_000;

/**
 * Picks the webhook URL an alert should actually be sent to — the
 * organization's own auto-captured one (flow/extra-01) takes priority, so
 * a workspace that's installed the Slack app gets alerts "for free" with
 * no separate manual step; a per-user manually-pasted URL is the fallback,
 * for a workspace that either hasn't installed the app (OAuth not
 * configured on this server) or connected it before this field existed.
 */
export function resolveSlackWebhookUrl(
  organizationIncomingWebhookUrl: string | undefined,
  userManualWebhookUrl: string | undefined
): string | undefined {
  return organizationIncomingWebhookUrl || userManualWebhookUrl || undefined;
}

/**
 * Posts one plain-text message to the configured Slack channel. Best-effort
 * by design at the call site (see notification-engine.ts) — a Slack outage
 * or a since-revoked webhook must never break the alert that's also going
 * out by email/in-app; this function itself still throws on failure so the
 * caller can log/ignore as it sees fit.
 */
export async function sendSlackAlert(webhookUrl: string, text: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Slack webhook returned ${res.status}: ${body}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
