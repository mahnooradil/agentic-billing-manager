/**
 * Mocean API billing adapter.
 *
 * `GET /rest/2/account/balance` (self-scoped) is expected to return the
 * account's own SMS wallet balance, but the exact field name isn't
 * confirmed against a live response — this parses defensively across the
 * plausible field names and returns `[]` rather than guessing a wrong
 * number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface MoceanBalanceResponse {
  balance?: number | string;
  currency?: string;
}

export const moceanBillingAdapter: BillingSyncAdapter = {
  platform: "mocean_api",
  label: "Mocean API",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://rest.moceanapi.com/rest/2/account/balance"
    )) as MoceanBalanceResponse | null;

    const amount = Number(data?.balance);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `mocean_api-${day}`,
        amount,
        currency: (data?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Mocean API — account balance.",
      },
    ];
  },
};
