/**
 * Open Exchange Rates billing adapter.
 *
 * `GET /api/usage.json` (self-scoped) returns the account's own remaining
 * monthly request quota. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface OpenExchangeRatesUsageResponse {
  data?: { usage?: { requests_remaining?: number } };
}

export const openexchangeratesBillingAdapter: BillingSyncAdapter = {
  platform: "open_exchange_rates",
  label: "Open Exchange Rates",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://openexchangerates.org/api/usage.json"
    )) as OpenExchangeRatesUsageResponse | null;

    const remaining = res?.data?.usage?.requests_remaining;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `open_exchange_rates-${period}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Open Exchange Rates — remaining monthly requests (credits, not currency).",
      },
    ];
  },
};
