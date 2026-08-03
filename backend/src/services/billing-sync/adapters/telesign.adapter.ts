/**
 * Telesign billing adapter.
 *
 * `GET /v1/account` (self-scoped, prepaid SMS/verification API) is
 * expected to return the account's remaining balance, but the exact field
 * name isn't confirmed against a live response — this parses defensively
 * across the plausible field names and returns `[]` rather than guessing
 * a wrong number. One snapshot per day, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TelesignAccountResponse {
  balance?: number;
  remaining_balance?: number;
  account_balance?: number;
  currency?: string;
}

export const telesignBillingAdapter: BillingSyncAdapter = {
  platform: "telesign",
  label: "Telesign",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://rest-api.telesign.com/v1/account"
    )) as TelesignAccountResponse | null;

    const amount = data?.balance ?? data?.remaining_balance ?? data?.account_balance;
    if (typeof amount !== "number") return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `telesign-${day}`,
        amount,
        currency: (data?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Telesign — account balance.",
      },
    ];
  },
};
