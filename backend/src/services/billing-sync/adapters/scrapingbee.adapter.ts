/**
 * ScrapingBee billing adapter.
 *
 * `GET /api/v1/usage` (self-scoped) returns the account's own API credit
 * usage vs. max; remaining is derived (max - used). Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ScrapingBeeUsageResponse {
  max_api_credit?: number;
  used_api_credit?: number;
}

export const scrapingbeeBillingAdapter: BillingSyncAdapter = {
  platform: "scrapingbee",
  label: "ScrapingBee",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://app.scrapingbee.com/api/v1/usage"
    )) as ScrapingBeeUsageResponse | null;

    const max = data?.max_api_credit;
    const used = data?.used_api_credit;
    if (typeof max !== "number" || typeof used !== "number") return [];

    const remaining = max - used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `scrapingbee-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from ScrapingBee — remaining API credits (credits, not currency).",
      },
    ];
  },
};
