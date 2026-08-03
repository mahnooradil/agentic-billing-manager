/**
 * CoinGecko billing adapter.
 *
 * `GET /api/v3/key` (self-scoped) returns the account's own remaining
 * monthly API call credits. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface CoinGeckoKeyResponse {
  current_remaining_monthly_calls?: number;
}

export const coingeckoBillingAdapter: BillingSyncAdapter = {
  platform: "coingecko",
  label: "CoinGecko",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.coingecko.com/api/v3/key"
    )) as CoinGeckoKeyResponse | null;

    const remaining = data?.current_remaining_monthly_calls;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `coingecko-${period}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from CoinGecko — remaining monthly API calls (credits, not currency).",
      },
    ];
  },
};
