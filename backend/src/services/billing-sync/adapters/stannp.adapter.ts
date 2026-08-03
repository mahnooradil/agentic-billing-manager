/**
 * Stannp billing adapter.
 *
 * `GET /v1/accounts/balance` (self-scoped) is expected to return the
 * account's own balance, but the exact field name isn't confirmed against
 * a live response — this parses defensively and returns `[]` rather than
 * guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface StannpBalanceResponse {
  data?: { balance?: number };
  balance?: number;
}

export const stannpBillingAdapter: BillingSyncAdapter = {
  platform: "stannp",
  label: "Stannp",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.stannp.com/v1/accounts/balance"
    )) as StannpBalanceResponse | null;

    const amount = res?.data?.balance ?? res?.balance;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `stannp-${day}`,
        amount,
        currency: "GBP",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Stannp — account balance.",
      },
    ];
  },
};
