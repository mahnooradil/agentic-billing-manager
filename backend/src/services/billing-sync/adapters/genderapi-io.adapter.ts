/**
 * GenderAPI.io billing adapter.
 *
 * `GET /api/v2/statistic` (self-scoped) is expected to return the
 * account's own remaining request credits, but the exact field name isn't
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface GenderApiIoStatisticResponse {
  remaining_credits?: number;
  credits?: number;
}

export const genderapiIoBillingAdapter: BillingSyncAdapter = {
  platform: "genderapi_io",
  label: "GenderAPI.io",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://genderapi.io/api/v2/statistic"
    )) as GenderApiIoStatisticResponse | null;

    const remaining = data?.remaining_credits ?? data?.credits;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `genderapi_io-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from GenderAPI.io — remaining credits (credits, not currency).",
      },
    ];
  },
};
