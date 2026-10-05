import { describe, expect, it } from "vitest";

import { resolveSlackWebhookUrl } from "@/services/notifications/slack";

/** flow/extra-01 — the org's own auto-captured webhook (from "Add to
 *  Slack") must take priority over the older per-user manually-pasted one,
 *  with the manual one as a fallback for whichever workspace doesn't have
 *  the org-level one yet. */
describe("resolveSlackWebhookUrl", () => {
  it("prefers the organization's auto-captured webhook when both exist", () => {
    expect(resolveSlackWebhookUrl("https://hooks.slack.com/org", "https://hooks.slack.com/user")).toBe(
      "https://hooks.slack.com/org"
    );
  });

  it("falls back to the user's manual webhook when the org has none", () => {
    expect(resolveSlackWebhookUrl(undefined, "https://hooks.slack.com/user")).toBe(
      "https://hooks.slack.com/user"
    );
  });

  it("returns undefined when neither exists", () => {
    expect(resolveSlackWebhookUrl(undefined, undefined)).toBeUndefined();
  });

  it("treats an empty-string org webhook the same as absent (falls back)", () => {
    expect(resolveSlackWebhookUrl("", "https://hooks.slack.com/user")).toBe(
      "https://hooks.slack.com/user"
    );
  });
});
