/**
 * StreamWish billing adapter.
 *
 * `GET /api/account/info` (self-scoped) returns the account's current
 * balance under `result.balance`. One record is synced per calendar month,
 * upserted by `externalId` — a re-sync during the same month UPDATES that
 * month's snapshot rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface StreamWishAccountResponse {
  result?: {
    balance?: string;
  };
}

export const streamwishBillingAdapter: BillingSyncAdapter = {
  platform: "streamwish",
  label: "StreamWish",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://streamwish.com/api/account/info"
    )) as StreamWishAccountResponse | null;

    const amount = Number(data?.result?.balance);
    if (!Number.isFinite(amount)) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `streamwish-${period}`,
        amount,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from StreamWish — current account balance.",
      },
    ];
  },
};
