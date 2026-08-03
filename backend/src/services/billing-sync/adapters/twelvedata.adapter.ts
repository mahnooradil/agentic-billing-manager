/**
 * Twelve Data billing adapter.
 *
 * `GET /api_usage` (self-scoped) returns the account's own daily API
 * usage vs. limit; remaining is derived (limit - used). Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TwelveDataApiUsageResponse {
  current_usage?: number;
  plan_limit?: number;
}

export const twelvedataBillingAdapter: BillingSyncAdapter = {
  platform: "twelve_data",
  label: "Twelve Data",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.twelvedata.com/api_usage"
    )) as TwelveDataApiUsageResponse | null;

    const limit = data?.plan_limit;
    const used = data?.current_usage;
    if (typeof limit !== "number" || typeof used !== "number") return [];

    const remaining = limit - used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `twelve_data-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Twelve Data — remaining daily API quota (credits, not currency).",
      },
    ];
  },
};
