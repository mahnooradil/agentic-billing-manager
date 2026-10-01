import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "@/config/env";
import { connectProxyRequest } from "@/services/integrations/pipedream";

/**
 * Real bug this guards against: a failed `connectProxyRequest` call used to
 * discard the provider's actual error body entirely, logging only an HTTP
 * status code — every failure at the same status looked identical
 * ("returned an error (400)"), with no way to tell "invalid search query"
 * apart from "token needs reconnecting" apart from "insufficient OAuth
 * scope". Found while diagnosing a real live failure (a stale/orphaned
 * Pipedream account for one workspace's Gmail connection) that this fix
 * immediately made diagnosable: the logged body turned out to be Pipedream's
 * own `{"error":"Auth provision owner mismatch"}`.
 */
describe("connectProxyRequest — error diagnostics", () => {
  const originalClientId = env.pipedreamClientId;
  const originalClientSecret = env.pipedreamClientSecret;
  const originalProjectId = env.pipedreamProjectId;

  afterEach(() => {
    vi.unstubAllGlobals();
    (env as { pipedreamClientId: string }).pipedreamClientId = originalClientId;
    (env as { pipedreamClientSecret: string }).pipedreamClientSecret = originalClientSecret;
    (env as { pipedreamProjectId: string }).pipedreamProjectId = originalProjectId;
  });

  it("logs the provider's real error body, not just the HTTP status", async () => {
    (env as { pipedreamClientId: string }).pipedreamClientId = "test-client-id";
    (env as { pipedreamClientSecret: string }).pipedreamClientSecret = "test-client-secret";
    (env as { pipedreamProjectId: string }).pipedreamProjectId = "test-project";

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "fake-token", expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ error: "Auth provision owner mismatch" }), {
        status: 400,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      connectProxyRequest("user-123", "apn_test", "https://gmail.googleapis.com/gmail/v1/users/me/messages")
    ).rejects.toThrow("The connected platform's API returned an error (400).");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Auth provision owner mismatch")
    );
  });
});
