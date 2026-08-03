/**
 * Seven (seven.io) billing adapter.
 *
 * `GET /api/balance?json=1` (self-scoped; the `json=1` param forces a JSON
 * response instead of the API's legacy plain-text default) is expected to
 * return the account's own SMS balance, but the exact field name isn't
 * confirmed against a live response — this parses defensively and returns
 * `[]` rather than guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface SevenBalanceResponse {
  balance?: number | string;
  credits?: number | string;
}

export const sevenBillingAdapter: BillingSyncAdapter = {
  platform: "seven",
  label: "Seven",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://gateway.seven.io/api/balance?json=1"
    )) as SevenBalanceResponse | null;

    const amount = Number(data?.balance ?? data?.credits);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `seven-${day}`,
        amount,
        currency: "EUR",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Seven — account balance.",
      },
    ];
  },
};
