/**
 * Temi billing adapter.
 *
 * `GET /account` (self-scoped) returns the account's current balance (a
 * decimal dollar figure). One record is synced per calendar month, upserted
 * by `externalId` — a re-sync during the same month UPDATES that month's
 * snapshot rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TemiAccountResponse {
  balance?: number;
}

export const temiBillingAdapter: BillingSyncAdapter = {
  platform: "temi",
  label: "Temi",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.temi.com/v1/account"
    )) as TemiAccountResponse | null;

    const amount = data?.balance;
    if (typeof amount !== "number") return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `temi-${period}`,
        amount,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Temi — current account balance.",
      },
    ];
  },
};
