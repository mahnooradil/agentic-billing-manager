/**
 * FireCrawl billing adapter.
 *
 * `GET /v2/team/credit-usage` (self-scoped) is expected to return the
 * team's own remaining credits, but the exact field name isn't confirmed
 * against a live response — this parses defensively and returns `[]`
 * rather than guessing a wrong number. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface FireCrawlCreditUsageResponse {
  data?: { remaining_credits?: number };
  remaining_credits?: number;
}

export const firecrawlBillingAdapter: BillingSyncAdapter = {
  platform: "firecrawl",
  label: "FireCrawl",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.firecrawl.dev/v2/team/credit-usage"
    )) as FireCrawlCreditUsageResponse | null;

    const remaining = res?.data?.remaining_credits ?? res?.remaining_credits;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `firecrawl-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from FireCrawl — remaining credits (credits, not currency).",
      },
    ];
  },
};
