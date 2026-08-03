/**
 * ScrapeOps billing adapter.
 *
 * `GET /proxy/account/usage` (self-scoped) is expected to return the
 * account's own remaining request credits, but neither the exact base
 * domain nor the field name is confirmed against a live response — this
 * parses defensively and returns `[]` rather than guessing a wrong
 * number. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ScrapeOpsUsageResponse {
  credit_limit?: number;
  credit_usage?: number;
}

export const scrapeopsBillingAdapter: BillingSyncAdapter = {
  platform: "scrapeops",
  label: "ScrapeOps",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.scrapeops.io/proxy/account/usage"
    )) as ScrapeOpsUsageResponse | null;

    const limit = data?.credit_limit;
    const used = data?.credit_usage;
    if (typeof limit !== "number" || typeof used !== "number") return [];

    const remaining = limit - used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `scrapeops-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from ScrapeOps — remaining credits (credits, not currency).",
      },
    ];
  },
};
