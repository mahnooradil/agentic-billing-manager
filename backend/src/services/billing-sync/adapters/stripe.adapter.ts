/**
 * Stripe billing adapter.
 *
 * `GET /v1/balance` (self-scoped) returns the connected account's own
 * available and pending funds — real money Stripe is holding for/owing to
 * the account holder. Amounts are in the smallest currency unit (cents),
 * so divided by 100. One record per currency per bucket, upserted by
 * `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface StripeBalanceEntry {
  amount?: number;
  currency?: string;
}

interface StripeBalanceResponse {
  available?: StripeBalanceEntry[];
  pending?: StripeBalanceEntry[];
}

export const stripeBillingAdapter: BillingSyncAdapter = {
  platform: "stripe",
  label: "Stripe",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.stripe.com/v1/balance"
    )) as StripeBalanceResponse | null;

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const buckets: { key: string; entries: StripeBalanceEntry[] }[] = [
      { key: "available", entries: data?.available ?? [] },
      { key: "pending", entries: data?.pending ?? [] },
    ];

    return buckets.flatMap(({ key, entries }) =>
      entries
        .filter((e) => typeof e.amount === "number" && e.amount !== 0 && e.currency)
        .map((e) => ({
          externalId: `stripe-${period}-${key}-${e.currency}`,
          amount: (e.amount as number) / 100,
          currency: (e.currency as string).toUpperCase(),
          billingDate: now,
          status: "Pending" as const,
          notes: `Auto-synced from Stripe — ${key} balance.`,
        }))
    );
  },
};
