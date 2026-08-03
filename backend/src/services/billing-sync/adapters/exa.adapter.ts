/**
 * Exa billing adapter.
 *
 * Two calls: `GET /api-keys` (self-scoped) discovers the connected
 * account's own API key id, then `GET /api-keys/{id}/usage` returns its
 * `total_cost_usd`. Both the discovery shape and the usage shape aren't
 * confirmed against a live response, so this parses defensively and
 * returns `[]` rather than guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ExaApiKey {
  id?: string;
}

interface ExaApiKeysResponse {
  apiKeys?: ExaApiKey[];
}

interface ExaUsageResponse {
  total_cost_usd?: number;
}

export const exaBillingAdapter: BillingSyncAdapter = {
  platform: "exa",
  label: "Exa",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const keys = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.exa.ai/api-keys"
    )) as ExaApiKeysResponse | null;

    const keyId = keys?.apiKeys?.[0]?.id;
    if (!keyId) return [];

    const usage = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.exa.ai/api-keys/${keyId}/usage`
    )) as ExaUsageResponse | null;

    const amount = usage?.total_cost_usd;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `exa-${period}`,
        amount,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Exa — usage cost this month.",
      },
    ];
  },
};
