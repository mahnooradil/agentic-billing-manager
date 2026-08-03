/**
 * OpenAI billing adapter.
 *
 * `GET /v1/organization/costs` (self-scoped to the connected org; requires
 * an Admin-scoped API key) returns time-bucketed cost line items for the
 * current month. Bucket amounts are summed into one monthly total,
 * upserted by `externalId`. If the connected key isn't Admin-scoped, this
 * call fails and safely syncs nothing.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface OpenAiCostResult {
  amount?: { value?: number; currency?: string };
}

interface OpenAiCostBucket {
  results?: OpenAiCostResult[];
}

interface OpenAiCostsResponse {
  data?: OpenAiCostBucket[];
}

export const openaiBillingAdapter: BillingSyncAdapter = {
  platform: "openai",
  label: "OpenAI",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const now = new Date();
    const monthStart = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000
    );

    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.openai.com/v1/organization/costs?start_time=${monthStart}&limit=180`
    )) as OpenAiCostsResponse | null;

    let total = 0;
    let currency = "usd";
    for (const bucket of data?.data ?? []) {
      for (const result of bucket.results ?? []) {
        if (typeof result.amount?.value === "number") {
          total += result.amount.value;
          if (result.amount.currency) currency = result.amount.currency;
        }
      }
    }

    if (total <= 0) return [];

    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `openai-${period}`,
        amount: total,
        currency: currency.toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from OpenAI — organization cost this month.",
      },
    ];
  },
};
