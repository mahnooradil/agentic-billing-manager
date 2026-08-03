/**
 * Infobip billing adapter.
 *
 * `GET /account/1/balance` (self-scoped) returns the account's current
 * balance and currency. One record is synced per calendar month, upserted by
 * `externalId` — a re-sync during the same month UPDATES that month's
 * snapshot rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface InfobipBalanceResponse {
  balance?: number;
  currency?: string;
}

export const infobipBillingAdapter: BillingSyncAdapter = {
  platform: "infobip",
  label: "Infobip",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.infobip.com/account/1/balance"
    )) as InfobipBalanceResponse | null;

    const amount = data?.balance;
    if (typeof amount !== "number") return [];

    const currency = data?.currency?.toUpperCase() || "EUR";
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `infobip-${period}`,
        amount,
        currency,
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Infobip — current account balance.",
      },
    ];
  },
};
