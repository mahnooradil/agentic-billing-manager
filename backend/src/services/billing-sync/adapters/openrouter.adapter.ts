/**
 * OpenRouter billing adapter.
 *
 * `GET /api/v1/key` (self-scoped) returns the connected key's total USD
 * usage to date. One record is synced per calendar month (the running
 * lifetime total, snapshotted), upserted by `externalId` — a re-sync during
 * the same month UPDATES that month's snapshot rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface OpenRouterKeyResponse {
  data?: {
    usage?: number;
  };
}

export const openrouterBillingAdapter: BillingSyncAdapter = {
  platform: "openrouter",
  label: "OpenRouter",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://openrouter.ai/api/v1/key"
    )) as OpenRouterKeyResponse | null;

    const amount = data?.data?.usage;
    if (typeof amount !== "number") return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `openrouter-${period}`,
        amount,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from OpenRouter — total usage to date.",
      },
    ];
  },
};
