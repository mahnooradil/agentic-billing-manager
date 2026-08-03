/**
 * ScrapingAnt billing adapter.
 *
 * `GET /v2/usage` (self-scoped) is expected to return the account's own
 * remaining request quota, but the exact field name isn't confirmed
 * against a live response — this parses defensively and returns `[]`
 * rather than guessing a wrong number. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ScrapingAntUsageResponse {
  requestsLeft?: number;
  requests_left?: number;
  remaining?: number;
}

export const scrapingantBillingAdapter: BillingSyncAdapter = {
  platform: "scrapingant",
  label: "ScrapingAnt",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.scrapingant.com/v2/usage"
    )) as ScrapingAntUsageResponse | null;

    const remaining = data?.requestsLeft ?? data?.requests_left ?? data?.remaining;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `scrapingant-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from ScrapingAnt — remaining request quota (credits, not currency).",
      },
    ];
  },
};
