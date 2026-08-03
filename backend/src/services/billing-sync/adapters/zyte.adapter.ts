/**
 * Zyte API billing adapter.
 *
 * `GET /api/stats` (self-scoped) is expected to return the account's own
 * usage, cost, and traffic stats, but neither the exact base domain nor
 * the field name is confirmed against a live response — this parses
 * defensively and returns `[]` rather than guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ZyteStatsResponse {
  cost?: number;
  currency?: string;
}

export const zyteBillingAdapter: BillingSyncAdapter = {
  platform: "zyte_api",
  label: "Zyte API",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.zyte.com/api/stats"
    )) as ZyteStatsResponse | null;

    if (typeof data?.cost !== "number" || data.cost <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `zyte_api-${day}`,
        amount: data.cost,
        currency: (data.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Zyte API — usage cost.",
      },
    ];
  },
};
