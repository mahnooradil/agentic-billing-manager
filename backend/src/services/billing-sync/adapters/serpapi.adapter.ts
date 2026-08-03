/**
 * SerpApi billing adapter.
 *
 * `GET /account.json` (self-scoped) returns the account's own remaining
 * plan searches. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface SerpApiAccountResponse {
  plan_searches_left?: number;
  total_searches_left?: number;
}

export const serpapiBillingAdapter: BillingSyncAdapter = {
  platform: "serpapi",
  label: "SerpApi",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://serpapi.com/account.json"
    )) as SerpApiAccountResponse | null;

    const remaining = data?.plan_searches_left ?? data?.total_searches_left;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `serpapi-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from SerpApi — remaining searches (credits, not currency).",
      },
    ];
  },
};
