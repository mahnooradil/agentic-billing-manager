/**
 * Octopush SMS billing adapter.
 *
 * `GET /v1/wallet/check-balance` (self-scoped) is expected to return the
 * account's own wallet balance, but the exact field name isn't confirmed
 * against a live response — this parses defensively across the plausible
 * field names and returns `[]` rather than guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface OctopushBalanceResponse {
  balance?: number | string;
  credit_balance?: number | string;
  currency?: string;
}

export const octopushBillingAdapter: BillingSyncAdapter = {
  platform: "octopush_sms",
  label: "Octopush SMS",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.octopush.com/v1/wallet/check-balance"
    )) as OctopushBalanceResponse | null;

    const amount = Number(data?.balance ?? data?.credit_balance);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `octopush_sms-${day}`,
        amount,
        currency: (data?.currency ?? "EUR").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Octopush SMS — wallet balance.",
      },
    ];
  },
};
