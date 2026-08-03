/**
 * Cloudflare billing adapter.
 *
 * Two calls: `GET /accounts` (self-scoped, no id needed) to discover the
 * connected account's own account id, then
 * `GET /accounts/{id}/billing/usage/paygo` for the current pay-as-you-go
 * billing period. One record per period, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface CloudflareAccountsResponse {
  result?: { id?: string }[];
}

interface CloudflareUsageResponse {
  result?: {
    total_cost?: number;
    currency?: string;
    billing_period_start?: string;
  };
}

export const cloudflareBillingAdapter: BillingSyncAdapter = {
  platform: "cloudflare_api_key",
  label: "Cloudflare",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const accounts = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.cloudflare.com/client/v4/accounts"
    )) as CloudflareAccountsResponse | null;

    const accountId = accounts?.result?.[0]?.id;
    if (!accountId) return [];

    const usage = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/billing/usage/paygo`
    )) as CloudflareUsageResponse | null;

    const amount = usage?.result?.total_cost;
    if (typeof amount !== "number") return [];

    const now = new Date();
    const period = usage?.result?.billing_period_start
      ? new Date(usage.result.billing_period_start)
      : now;
    const periodKey = `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `cloudflare-${periodKey}`,
        amount,
        currency: usage?.result?.currency?.toUpperCase() || "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Cloudflare — current pay-as-you-go billing period.",
      },
    ];
  },
};
