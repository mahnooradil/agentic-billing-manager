/**
 * PayPal billing adapter.
 *
 * `GET /v1/reporting/balances` (self-scoped) returns the connected
 * account's own held balance per currency. One snapshot per currency per
 * month, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface PayPalMoney {
  currency_code?: string;
  value?: string;
}

interface PayPalBalanceEntry {
  currency?: string;
  total_balance?: PayPalMoney;
}

interface PayPalBalancesResponse {
  balances?: PayPalBalanceEntry[];
}

export const paypalBillingAdapter: BillingSyncAdapter = {
  platform: "paypal",
  label: "PayPal",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api-m.paypal.com/v1/reporting/balances"
    )) as PayPalBalancesResponse | null;

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return (data?.balances ?? [])
      .map((b) => ({
        currency: b.total_balance?.currency_code ?? b.currency,
        value: Number(b.total_balance?.value),
      }))
      .filter((b) => b.currency && Number.isFinite(b.value) && b.value > 0)
      .map((b) => ({
        externalId: `paypal-${period}-${b.currency}`,
        amount: b.value,
        currency: (b.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: "Auto-synced from PayPal — account balance.",
      }));
  },
};
