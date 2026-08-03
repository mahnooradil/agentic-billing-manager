/**
 * WebScraping.AI billing adapter.
 *
 * `GET /account` (self-scoped) is expected to return the account's own
 * remaining API calls, but the exact field name isn't confirmed against a
 * live response — this parses defensively and returns `[]` rather than
 * guessing a wrong number. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface WebScrapingAiAccountResponse {
  remaining_api_calls?: number;
  remaining_calls?: number;
}

export const webscrapingAiBillingAdapter: BillingSyncAdapter = {
  platform: "webscraping_ai",
  label: "WebScraping.AI",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.webscraping.ai/account"
    )) as WebScrapingAiAccountResponse | null;

    const remaining = data?.remaining_api_calls ?? data?.remaining_calls;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `webscraping_ai-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from WebScraping.AI — remaining API calls (credits, not currency).",
      },
    ];
  },
};
