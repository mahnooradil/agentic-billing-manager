/**
 * Slack alerts — via a Slack "Incoming Webhook" URL the user creates
 * themselves in their own Slack workspace (Slack App settings → Incoming
 * Webhooks), not through any OAuth/Connect flow here. Matches this
 * project's convention (see services/email/resend.ts) of a single plain
 * `fetch` call instead of pulling in an SDK for one documented REST call.
 *
 * The URL is validated at the settings layer (see
 * user-settings.validator.ts) to be exactly `https://hooks.slack.com/...`,
 * so this never ends up POSTing to an arbitrary/internal address.
 */
const SEND_TIMEOUT_MS = 10_000;

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
