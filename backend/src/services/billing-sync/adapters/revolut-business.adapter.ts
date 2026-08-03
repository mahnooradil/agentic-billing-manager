/**
 * Revolut Business billing adapter.
 *
 * `GET /api/1.0/accounts` (self-scoped) returns every account the business
 * holds, each with its own balance and currency. One record per account
 * per day, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface RevolutAccount {
  id?: string;
  balance?: number;
  currency?: string;
}

export const revolutBusinessBillingAdapter: BillingSyncAdapter = {
  platform: "revolut_business",
  label: "Revolut Business",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://b2b.revolut.com/api/1.0/accounts"
    )) as RevolutAccount[] | null;

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return (data ?? [])
      .filter((a) => a.id && typeof a.balance === "number" && a.balance > 0 && a.currency)
      .map((a) => ({
        externalId: `revolut_business-${day}-${a.id}`,
        amount: a.balance as number,
        currency: (a.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: "Auto-synced from Revolut Business — account balance.",
      }));
  },
};
