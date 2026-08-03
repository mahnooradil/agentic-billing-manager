/**
 * Anthropic billing adapter.
 *
 * `GET /v1/organizations/usage_report/cost` (self-scoped to the connected
 * org; requires an Admin-scoped API key) returns time-bucketed cost line
 * items for the current month. Field names for the cost figure aren't
 * fully confirmed live, so this parses defensively across the plausible
 * shapes and returns `[]` rather than guessing a wrong number. Bucket
 * amounts are summed into one monthly total, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface AnthropicCostResult {
  amount?: number | string;
  currency?: string;
}

interface AnthropicCostBucket {
  results?: AnthropicCostResult[];
}

interface AnthropicCostReportResponse {
  data?: AnthropicCostBucket[];
}

export const anthropicBillingAdapter: BillingSyncAdapter = {
  platform: "anthropic",
  label: "Anthropic",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString();

    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.anthropic.com/v1/organizations/usage_report/cost?starting_at=${monthStart}`,
      { headers: { "anthropic-version": "2023-06-01" } }
    )) as AnthropicCostReportResponse | null;

    let total = 0;
    let currency = "USD";
    for (const bucket of data?.data ?? []) {
      for (const result of bucket.results ?? []) {
        const value = Number(result.amount);
        if (Number.isFinite(value)) {
          total += value;
          if (result.currency) currency = result.currency;
        }
      }
    }

    if (total <= 0) return [];

    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `anthropic-${period}`,
        amount: total,
        currency: currency.toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Anthropic — organization cost this month.",
      },
    ];
  },
};
