/**
 * Meta (Facebook) Ads billing adapter.
 *
 * `GET /me/adaccounts?fields=account_id,name,balance,currency` (self-scoped,
 * one call) returns every ad account the connected user manages, each with
 * its own current amount due. `balance` is in the account currency's minor
 * unit (cents) for standard two-decimal currencies — zero-decimal
 * currencies (e.g. JPY) would need special-casing this doesn't attempt.
 * One record per ad account, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface FacebookAdAccount {
  account_id?: string;
  name?: string;
  balance?: string;
  currency?: string;
}

interface FacebookAdAccountsResponse {
  data?: FacebookAdAccount[];
}

export const facebookAdsBillingAdapter: BillingSyncAdapter = {
  platform: "facebook_ads",
  label: "Meta Ads",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://graph.facebook.com/v19.0/me/adaccounts?fields=account_id,name,balance,currency"
    )) as FacebookAdAccountsResponse | null;

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return (data?.data ?? [])
      .map((a) => ({
        id: a.account_id,
        amount: Number(a.balance) / 100,
        currency: a.currency,
      }))
      .filter((a) => a.id && a.currency && Number.isFinite(a.amount) && a.amount > 0)
      .map((a) => ({
        externalId: `facebook_ads-${day}-${a.id}`,
        amount: a.amount,
        currency: (a.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: "Auto-synced from Meta Ads — current amount due.",
      }));
  },
};
