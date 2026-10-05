import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { env } from "@/config/env";
import { Organization } from "@/models/organization.model";
import { getInstallUrl, handleOAuthCallback } from "@/services/slack/slack-oauth.service";

describe("slack-oauth.service (flow/extra-01 — per-org bot + auto webhook)", () => {
  const original = {
    slackClientId: env.slackClientId,
    slackClientSecret: env.slackClientSecret,
    slackOauthRedirectUri: env.slackOauthRedirectUri,
    slackSigningSecret: env.slackSigningSecret,
    jwtSecret: env.jwtSecret,
  };

  beforeEach(() => {
    (env as unknown as { slackClientId: string }).slackClientId = "test-client-id";
    (env as unknown as { slackClientSecret: string }).slackClientSecret = "test-client-secret";
    (env as unknown as { slackOauthRedirectUri: string }).slackOauthRedirectUri =
      "https://example.test/api/slack/oauth/callback";
    (env as unknown as { slackSigningSecret: string }).slackSigningSecret = "test-signing-secret";
    if (!env.jwtSecret) {
      (env as unknown as { jwtSecret: string }).jwtSecret = "test-jwt-secret-for-slack-oauth-state";
    }
  });

  afterEach(() => {
    (env as unknown as { slackClientId: string }).slackClientId = original.slackClientId;
    (env as unknown as { slackClientSecret: string }).slackClientSecret = original.slackClientSecret;
    (env as unknown as { slackOauthRedirectUri: string }).slackOauthRedirectUri =
      original.slackOauthRedirectUri;
    (env as unknown as { slackSigningSecret: string }).slackSigningSecret = original.slackSigningSecret;
    (env as unknown as { jwtSecret: string }).jwtSecret = original.jwtSecret;
    vi.restoreAllMocks();
  });

  it("getInstallUrl's scope list includes incoming-webhook alongside the existing bot scopes", () => {
    const url = getInstallUrl("507f1f77bcf86cd799439011");
    const params = new URL(url).searchParams;
    const scopes = (params.get("scope") ?? "").split(",");
    expect(scopes).toContain("incoming-webhook");
    expect(scopes).toContain("chat:write");
  });

  it("handleOAuthCallback captures the incoming_webhook.url onto the organization", async () => {
    const organization = await Organization.create({ name: "Slack Webhook Test Org" });
    const installUrl = getInstallUrl(organization._id.toString());
    const state = new URL(installUrl).searchParams.get("state") as string;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          access_token: "xoxb-fake-bot-token",
          bot_user_id: "U123",
          team: { id: "T123", name: "Test Team" },
          incoming_webhook: { url: "https://hooks.slack.com/services/T123/FAKE", channel: "#billing" },
        }),
      })
    );

    await handleOAuthCallback("fake-code", state);

    const reloaded = await Organization.findById(organization._id);
    expect(reloaded?.slackWorkspace?.teamId).toBe("T123");
    expect(reloaded?.slackWorkspace?.incomingWebhookUrl).toBe(
      "https://hooks.slack.com/services/T123/FAKE"
    );
    // The bot token must still be encrypted at rest, never the raw value.
    expect(reloaded?.slackWorkspace?.botToken).not.toBe("xoxb-fake-bot-token");
  });

  it("handles an install where the admin somehow didn't grant incoming-webhook — no crash, just absent", async () => {
    const organization = await Organization.create({ name: "No Webhook Org" });
    const installUrl = getInstallUrl(organization._id.toString());
    const state = new URL(installUrl).searchParams.get("state") as string;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          access_token: "xoxb-fake-bot-token-2",
          bot_user_id: "U456",
          team: { id: "T456", name: "No Webhook Team" },
          // incoming_webhook deliberately omitted
        }),
      })
    );

    await handleOAuthCallback("fake-code-2", state);

    const reloaded = await Organization.findById(organization._id);
    expect(reloaded?.slackWorkspace?.teamId).toBe("T456");
    expect(reloaded?.slackWorkspace?.incomingWebhookUrl).toBeUndefined();
  });
});
