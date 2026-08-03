/**
 * CoinMarketCap billing adapter.
 *
 * `GET /v1/key/info` (self-scoped) returns the account's own monthly
 * credit limit vs. used; remaining is derived (limit - used). Recorded
 * with a non-currency `CRD` code (see elevenlabs.adapter.ts) — always
 * synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface CoinMarketCapKeyInfoResponse {
  data?: {
    plan?: { credit_limit_monthly?: number };
    usage?: { current_month?: { credits_used?: number } };
  };
}

export const coinmarketcapBillingAdapter: BillingSyncAdapter = {
  platform: "coinmarketcap",
  label: "CoinMarketCap",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://pro-api.coinmarketcap.com/v1/key/info"
    )) as CoinMarketCapKeyInfoResponse | null;

    const limit = res?.data?.plan?.credit_limit_monthly;
    const used = res?.data?.usage?.current_month?.credits_used;
    if (typeof limit !== "number" || typeof used !== "number") return [];

    const remaining = limit - used;
    if (remaining < 0) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `coinmarketcap-${period}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from CoinMarketCap — remaining monthly credits (credits, not currency).",
      },
    ];
  },
};
