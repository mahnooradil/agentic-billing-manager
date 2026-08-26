import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { SlackLinkCodeData } from "@/services/types/slack";

/** POST /slack/link-code — issues a fresh short-lived code to DM the bot
 *  with, linking this account so it can chat with the Billing Advisor Agent
 *  from Slack. */
export function createSlackLinkCode(): Promise<ApiSuccess<SlackLinkCodeData>> {
  return api.post<ApiSuccess<SlackLinkCodeData>>("/slack/link-code");
}
