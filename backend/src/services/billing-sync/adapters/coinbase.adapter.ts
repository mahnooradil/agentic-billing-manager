/**
 * Coinbase billing adapter.
 *
 * `GET /v2/accounts` (self-scoped) returns every wallet the account holds
 * — its own funds, not a bill owed to anyone else, same pattern as the
 * Stripe/PayPal balance adapters. One record per non-zero wallet per day,
 * upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface CoinbaseAccount {
  id?: string;
  balance?: {
    amount?: string;
    currency?: string;
  };
}

interface CoinbaseAccountsResponse {
  data?: CoinbaseAccount[];
}

export const coinbaseBillingAdapter: BillingSyncAdapter = {
  platform: "coinbase",
  label: "Coinbase",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.coinbase.com/v2/accounts"
    )) as CoinbaseAccountsResponse | null;

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return (data?.data ?? [])
      .map((a) => ({
        id: a.id,
        amount: Number(a.balance?.amount),
        currency: a.balance?.currency,
      }))
      .filter((a) => a.id && a.currency && Number.isFinite(a.amount) && a.amount > 0)
      .map((a) => ({
        externalId: `coinbase-${day}-${a.id}`,
        amount: a.amount,
        currency: (a.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: "Auto-synced from Coinbase — wallet balance.",
      }));
  },
};
