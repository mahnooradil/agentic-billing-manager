/**
 * Mollie billing adapter.
 *
 * `GET /v2/balances` (self-scoped) returns the connected account's own
 * balances, one per currency, each with an available-amount figure. One
 * snapshot per currency per day, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface MollieAmount {
  value?: string;
  currency?: string;
}

interface MollieBalance {
  id?: string;
  availableAmount?: MollieAmount;
}

interface MollieBalancesResponse {
  _embedded?: {
    balances?: MollieBalance[];
  };
}

export const mollieBillingAdapter: BillingSyncAdapter = {
  platform: "mollie",
  label: "Mollie",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.mollie.com/v2/balances"
    )) as MollieBalancesResponse | null;

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return (data?._embedded?.balances ?? [])
      .map((b) => ({
        id: b.id,
        value: Number(b.availableAmount?.value),
        currency: b.availableAmount?.currency,
      }))
      .filter((b) => b.id && b.currency && Number.isFinite(b.value) && b.value > 0)
      .map((b) => ({
        externalId: `mollie-${day}-${b.id}`,
        amount: b.value,
        currency: (b.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: "Auto-synced from Mollie — available balance.",
      }));
  },
};
