/**
 * Datadog billing adapter.
 *
 * `GET /api/v2/usage/estimated_cost?view=summary` (self-scoped to the
 * connected org) returns estimated cost line items for the current billing
 * period. Costs are summed into one monthly total, upserted by
 * `externalId`. Datadog's API needs both an API key and an Application key —
 * if the connected account only has one, this safely syncs nothing.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface DatadogCostItem {
  attributes?: {
    charges?: { cost?: number }[];
    total_cost?: number;
  };
}

interface DatadogEstimatedCostResponse {
  data?: DatadogCostItem[];
}

export const datadogBillingAdapter: BillingSyncAdapter = {
  platform: "datadog",
  label: "Datadog",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.datadoghq.com/api/v2/usage/estimated_cost?view=summary"
    )) as DatadogEstimatedCostResponse | null;

    const items = data?.data ?? [];
    const totalCost = items.reduce((sum, item) => {
      if (typeof item.attributes?.total_cost === "number") {
        return sum + item.attributes.total_cost;
      }
      const chargesSum = (item.attributes?.charges ?? []).reduce(
        (s, c) => s + (c.cost ?? 0),
        0
      );
      return sum + chargesSum;
    }, 0);

    if (totalCost <= 0) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `datadog-${period}`,
        amount: totalCost,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Datadog — estimated cost for the current period.",
      },
    ];
  },
};
