/**
 * currencyapi billing adapter.
 *
 * `GET /v3/status` (self-scoped) returns the account's own remaining
 * monthly request quota. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface CurrencyApiStatusResponse {
  quotas?: { month?: { remaining?: number } };
}

export const currencyapiBillingAdapter: BillingSyncAdapter = {
  platform: "currencyapi",
  label: "currencyapi",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.currencyapi.com/v3/status"
    )) as CurrencyApiStatusResponse | null;

    const remaining = data?.quotas?.month?.remaining;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `currencyapi-${period}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from currencyapi — remaining monthly quota (credits, not currency).",
      },
    ];
  },
};
