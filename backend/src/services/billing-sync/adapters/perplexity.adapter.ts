/**
 * Perplexity billing adapter.
 *
 * `GET /v1/analytics/computer/usage` (self-scoped) is expected to return
 * the account's own usage data, but the exact field shape isn't confirmed
 * against a live response — this parses defensively and returns `[]`
 * rather than guessing a wrong number. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface PerplexityUsageResponse {
  remaining_requests?: number;
  usage?: number;
}

export const perplexityBillingAdapter: BillingSyncAdapter = {
  platform: "perplexity",
  label: "Perplexity",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.perplexity.ai/v1/analytics/computer/usage"
    )) as PerplexityUsageResponse | null;

    const remaining = data?.remaining_requests;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `perplexity-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Perplexity — remaining request quota (credits, not currency).",
      },
    ];
  },
};
