/**
 * Mistral AI billing adapter.
 *
 * `GET /v1/admin/usage` (requires an Admin-scoped API key) is expected to
 * return the org's own usage/cost data, but the exact field shape isn't
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. If the connected key
 * isn't Admin-scoped, this call fails and safely syncs nothing.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface MistralAdminUsageResponse {
  total_cost?: number;
  cost?: number;
  currency?: string;
}

export const mistralAiBillingAdapter: BillingSyncAdapter = {
  platform: "mistral_ai",
  label: "Mistral AI",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.mistral.ai/v1/admin/usage"
    )) as MistralAdminUsageResponse | null;

    const amount = data?.total_cost ?? data?.cost;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `mistral_ai-${period}`,
        amount,
        currency: (data?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Mistral AI — usage cost this month.",
      },
    ];
  },
};
