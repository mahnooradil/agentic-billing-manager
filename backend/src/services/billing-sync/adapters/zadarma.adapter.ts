/**
 * Zadarma billing adapter.
 *
 * `GET /v1/info/balance/` (self-scoped) returns the account's own VoIP
 * balance and currency. One snapshot per day, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ZadarmaBalanceResponse {
  balance?: string | number;
  currency?: string;
}

export const zadarmaBillingAdapter: BillingSyncAdapter = {
  platform: "zadarma",
  label: "Zadarma",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.zadarma.com/v1/info/balance/"
    )) as ZadarmaBalanceResponse | null;

    const amount = Number(data?.balance);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `zadarma-${day}`,
        amount,
        currency: (data?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Zadarma — account balance.",
      },
    ];
  },
};
