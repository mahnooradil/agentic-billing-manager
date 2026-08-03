/**
 * Tremendous billing adapter.
 *
 * `GET /funding_sources/BALANCE` (the literal keyword `BALANCE` in place of an
 * id is Tremendous's own self-scoped shortcut) returns the account's prepaid
 * funding balance. One record is synced per calendar month, upserted by
 * `externalId` — a re-sync during the same month UPDATES that month's
 * snapshot rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TremendousFundingSourceResponse {
  funding_source?: {
    available_amount?: number;
    currency_code?: string;
  };
}

export const tremendousBillingAdapter: BillingSyncAdapter = {
  platform: "tremendous",
  label: "Tremendous",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.tremendous.com/api/v2/funding_sources/BALANCE"
    )) as TremendousFundingSourceResponse | null;

    const amount = data?.funding_source?.available_amount;
    if (typeof amount !== "number") return [];

    const currency = data?.funding_source?.currency_code?.toUpperCase() || "USD";
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `tremendous-${period}`,
        amount,
        currency,
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Tremendous — available funding balance.",
      },
    ];
  },
};
