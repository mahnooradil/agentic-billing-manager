/**
 * TextMagic billing adapter.
 *
 * `GET /api/v2/user` (self-scoped) returns the account's current balance.
 * One record is synced per calendar month, upserted by `externalId` — a
 * re-sync during the same month UPDATES that month's snapshot rather than
 * duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TextMagicUserResponse {
  balance?: number;
  currency?: { id?: string } | string;
}

export const textmagicBillingAdapter: BillingSyncAdapter = {
  platform: "textmagic",
  label: "TextMagic",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://rest.textmagic.com/api/v2/user"
    )) as TextMagicUserResponse | null;

    const amount = data?.balance;
    if (typeof amount !== "number") return [];

    const currency =
      (typeof data?.currency === "string" ? data.currency : data?.currency?.id)?.toUpperCase() ||
      "USD";
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `textmagic-${period}`,
        amount,
        currency,
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from TextMagic — current account balance.",
      },
    ];
  },
};
