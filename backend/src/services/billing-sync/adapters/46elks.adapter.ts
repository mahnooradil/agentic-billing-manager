/**
 * 46elks billing adapter.
 *
 * `GET /a1/me` (self-scoped) returns the account's own balance. The unit
 * convention (major vs. minor currency unit) isn't confirmed against a
 * live response, so the raw value is used as-is rather than guessing a
 * division factor. One snapshot per day, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface FortySixElksAccountResponse {
  balance?: number;
  currency?: string;
}

export const fortySixElksBillingAdapter: BillingSyncAdapter = {
  platform: "46elks",
  label: "46elks",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.46elks.com/a1/me"
    )) as FortySixElksAccountResponse | null;

    if (typeof data?.balance !== "number") return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `46elks-${day}`,
        amount: data.balance,
        currency: (data.currency ?? "SEK").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from 46elks — account balance.",
      },
    ];
  },
};
