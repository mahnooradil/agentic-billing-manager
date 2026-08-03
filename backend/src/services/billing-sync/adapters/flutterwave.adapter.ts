/**
 * Flutterwave billing adapter.
 *
 * `GET /v3/balances` (self-scoped) returns the account's balance in every
 * currency it holds one in. One record per non-zero currency balance,
 * upserted by `externalId` — a re-sync UPDATES that month's snapshot per
 * currency rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface FlutterwaveBalance {
  currency?: string;
  available_balance?: number;
}

interface FlutterwaveBalancesResponse {
  data?: FlutterwaveBalance[];
}

export const flutterwaveBillingAdapter: BillingSyncAdapter = {
  platform: "flutterwave",
  label: "Flutterwave",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.flutterwave.com/v3/balances"
    )) as FlutterwaveBalancesResponse | null;

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return (data?.data ?? [])
      .filter((b) => typeof b.available_balance === "number" && b.currency)
      .map((b) => ({
        externalId: `flutterwave-${period}-${b.currency}`,
        amount: b.available_balance as number,
        currency: (b.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: `Auto-synced from Flutterwave — ${b.currency} balance.`,
      }));
  },
};
