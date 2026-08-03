/**
 * Apify billing adapter.
 *
 * `GET /v2/users/me/usage/monthly` (self-scoped) is expected to return the
 * account's own monthly usage cost in USD, but the exact field name isn't
 * confirmed against a live response — this parses defensively and returns
 * `[]` rather than guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ApifyMonthlyUsageResponse {
  data?: { monthlyUsageUsd?: number; totalUsageCreditsUsd?: number };
}

export const apifyBillingAdapter: BillingSyncAdapter = {
  platform: "apify",
  label: "Apify",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.apify.com/v2/users/me/usage/monthly"
    )) as ApifyMonthlyUsageResponse | null;

    const amount = res?.data?.monthlyUsageUsd ?? res?.data?.totalUsageCreditsUsd;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `apify-${period}`,
        amount,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Apify — usage cost this month.",
      },
    ];
  },
};
