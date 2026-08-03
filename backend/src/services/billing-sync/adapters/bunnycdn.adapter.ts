/**
 * BunnyCDN billing adapter.
 *
 * BunnyCDN's `GET /billing` (base `https://api.bunny.net`) returns an account-
 * wide snapshot — `Balance`, `ThisMonthCharges`, and a per-region monthly charge
 * breakdown. There is no per-invoice list in this endpoint, so one record is
 * synced per calendar month, upserted by `externalId` — a re-sync during the
 * same month UPDATES that month's running total rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface BunnyBillingResponse {
  Balance?: number;
  ThisMonthCharges?: number;
}

export const bunnycdnBillingAdapter: BillingSyncAdapter = {
  platform: "bunnycdn",
  label: "BunnyCDN",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.bunny.net/billing"
    )) as BunnyBillingResponse | null;

    const charges = data?.ThisMonthCharges;
    if (typeof charges !== "number") return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `bunnycdn-${period}`,
        amount: charges,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from BunnyCDN — running total for the current month.",
      },
    ];
  },
};
