/**
 * Gender API billing adapter.
 *
 * `GET /v2/statistic` (self-scoped) is expected to return the account's
 * own remaining request credits, but the exact field name isn't confirmed
 * against a live response — this parses defensively and returns `[]`
 * rather than guessing a wrong number. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface GenderApiStatisticResponse {
  remaining_credits?: number;
  credits?: number;
}

export const genderApiBillingAdapter: BillingSyncAdapter = {
  platform: "gender_api",
  label: "Gender API",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://gender-api.com/v2/statistic"
    )) as GenderApiStatisticResponse | null;

    const remaining = data?.remaining_credits ?? data?.credits;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `gender_api-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Gender API — remaining credits (credits, not currency).",
      },
    ];
  },
};
