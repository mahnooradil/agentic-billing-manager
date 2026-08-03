/**
 * GoCardless billing adapter.
 *
 * `GET /payouts` (self-scoped, requires the `GoCardless-Version` header)
 * returns every payout GoCardless has made to the connected merchant —
 * their own money, same "own account balance/proceeds" pattern as the
 * Stripe/PayPal adapters. Amounts are in the smallest currency unit
 * (cents/pence), so divided by 100. Each payout becomes one record,
 * upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface GoCardlessPayout {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  created_at?: string;
}

interface GoCardlessPayoutsResponse {
  payouts?: GoCardlessPayout[];
}

function statusFor(status: string | undefined): "Pending" | "Paid" | "Overdue" {
  if (status === "paid") return "Paid";
  if (status === "bounced") return "Overdue";
  return "Pending";
}

export const gocardlessBillingAdapter: BillingSyncAdapter = {
  platform: "gocardless",
  label: "GoCardless",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.gocardless.com/payouts",
      { headers: { "GoCardless-Version": "2015-07-06" } }
    )) as GoCardlessPayoutsResponse | null;

    return (data?.payouts ?? [])
      .filter((p) => p.id && typeof p.amount === "number")
      .map((p) => ({
        externalId: `gocardless-${p.id}`,
        amount: (p.amount as number) / 100,
        currency: p.currency?.toUpperCase() || "GBP",
        billingDate: new Date(p.created_at ?? Date.now()),
        status: statusFor(p.status),
        notes: "Auto-synced from GoCardless — payout to your account.",
      }));
  },
};
