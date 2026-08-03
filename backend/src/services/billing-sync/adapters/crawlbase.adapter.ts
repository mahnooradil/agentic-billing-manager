/**
 * Crawlbase billing adapter.
 *
 * `GET /account` (self-scoped) is expected to return the account's own
 * remaining credits, but the exact field name isn't confirmed against a
 * live response — this parses defensively and returns `[]` rather than
 * guessing a wrong number. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface CrawlbaseAccountResponse {
  credits_remaining?: number;
  credits?: number;
}

export const crawlbaseBillingAdapter: BillingSyncAdapter = {
  platform: "crawlbase",
  label: "Crawlbase",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.crawlbase.com/account"
    )) as CrawlbaseAccountResponse | null;

    const credits = data?.credits_remaining ?? data?.credits;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `crawlbase-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Crawlbase — remaining credits (credits, not currency).",
      },
    ];
  },
};
