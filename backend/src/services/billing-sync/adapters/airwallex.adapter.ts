/**
 * Airwallex billing adapter.
 *
 * `GET /api/v1/balances/current` (self-scoped) returns the connected
 * account's own held balance per currency. One snapshot per currency per
 * day, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface AirwallexBalance {
  currency?: string;
  current_balance?: number;
  total_balance?: number;
}

export const airwallexBillingAdapter: BillingSyncAdapter = {
  platform: "airwallex",
  label: "Airwallex",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.airwallex.com/api/v1/balances/current"
    )) as AirwallexBalance[] | null;

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return (data ?? [])
      .map((b) => ({
        currency: b.currency,
        amount: b.current_balance ?? b.total_balance,
      }))
      .filter((b) => b.currency && typeof b.amount === "number" && b.amount > 0)
      .map((b) => ({
        externalId: `airwallex-${day}-${b.currency}`,
        amount: b.amount as number,
        currency: (b.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: "Auto-synced from Airwallex — account balance.",
      }));
  },
};
