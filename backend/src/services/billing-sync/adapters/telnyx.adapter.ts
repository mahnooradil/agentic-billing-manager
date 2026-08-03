/**
 * Telnyx billing adapter.
 *
 * `GET /v2/balance` (self-scoped) returns the account's current balance and
 * currency. One record is synced per calendar month, upserted by
 * `externalId` — a re-sync during the same month UPDATES that month's
 * snapshot rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TelnyxBalanceResponse {
  data?: {
    balance?: string;
    currency?: string;
  };
}

export const telnyxBillingAdapter: BillingSyncAdapter = {
  platform: "telnyx",
  label: "Telnyx",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.telnyx.com/v2/balance"
    )) as TelnyxBalanceResponse | null;

    const amount = Number(data?.data?.balance);
    if (!Number.isFinite(amount)) return [];

    const currency = data?.data?.currency?.toUpperCase() || "USD";
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `telnyx-${period}`,
        amount,
        currency,
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Telnyx — current account balance.",
      },
    ];
  },
};
