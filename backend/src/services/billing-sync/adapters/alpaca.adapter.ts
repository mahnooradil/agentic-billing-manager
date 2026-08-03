/**
 * Alpaca (trading) billing adapter.
 *
 * `GET /v2/account` (self-scoped) returns the connected brokerage
 * account's own cash balance in its base currency. One snapshot per day,
 * upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface AlpacaAccountResponse {
  cash?: string;
  currency?: string;
}

export const alpacaBillingAdapter: BillingSyncAdapter = {
  platform: "alpaca",
  label: "Alpaca",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.alpaca.markets/v2/account"
    )) as AlpacaAccountResponse | null;

    const amount = Number(data?.cash);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `alpaca-${day}`,
        amount,
        currency: (data?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Alpaca — account cash balance.",
      },
    ];
  },
};
