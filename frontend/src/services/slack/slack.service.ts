import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { SlackLinkCodeData, SlackStatusData } from "@/services/types/slack";

/** GET /slack/status — whether the active organization has connected a
 *  Slack workspace yet (via "Add to Slack"). */
export function getSlackStatus(): Promise<ApiSuccess<SlackStatusData>> {
  return api.get<ApiSuccess<SlackStatusData>>("/slack/status");
}

/** GET /slack/install — the Slack "Add to Slack" consent URL for the active
 *  organization; the caller does a full-page redirect there (Slack's own
 *  hosted page), not an in-app navigation — same pattern as Stripe Checkout. */
export function getSlackInstallUrl(): Promise<ApiSuccess<{ url: string }>> {
  return api.get<ApiSuccess<{ url: string }>>("/slack/install");
}

/** POST /slack/link-code — issues a fresh short-lived code to DM the bot
 *  with, linking this account so it can chat with the Billing Advisor Agent
 *  from Slack. */
export function createSlackLinkCode(): Promise<ApiSuccess<SlackLinkCodeData>> {
  return api.post<ApiSuccess<SlackLinkCodeData>>("/slack/link-code");
}
