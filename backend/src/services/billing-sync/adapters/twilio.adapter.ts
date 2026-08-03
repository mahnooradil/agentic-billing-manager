/**
 * Twilio billing adapter.
 *
 * Two calls: `GET /Accounts.json` (self-scoped, no id needed) to discover the
 * connected account's own SID, then `GET /Accounts/{sid}/Usage/Records/ThisMonth.json`
 * — Twilio's own shortcut for "aggregate usage this month, by category" (no
 * manual date-range math needed). One record per category with a non-zero
 * price, upserted by `externalId` — a re-sync during the same month UPDATES
 * each category's running total rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TwilioAccountsResponse {
  accounts?: { sid?: string }[];
}

interface TwilioUsageRecord {
  category?: string;
  description?: string;
  price?: string;
  price_unit?: string;
}

interface TwilioUsageResponse {
  usage_records?: TwilioUsageRecord[];
}

export const twilioBillingAdapter: BillingSyncAdapter = {
  platform: "twilio",
  label: "Twilio",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const accounts = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.twilio.com/2010-04-01/Accounts.json"
    )) as TwilioAccountsResponse | null;

    const sid = accounts?.accounts?.[0]?.sid;
    if (!sid) return [];

    const usage = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records/ThisMonth.json`
    )) as TwilioUsageResponse | null;

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return (usage?.usage_records ?? [])
      .filter((r) => r.category && Number(r.price) > 0)
      .map((r) => ({
        externalId: `twilio-${period}-${r.category}`,
        amount: Number(r.price),
        currency: (r.price_unit || "usd").toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: `Auto-synced from Twilio — ${r.description ?? r.category} this month.`,
      }));
  },
};
