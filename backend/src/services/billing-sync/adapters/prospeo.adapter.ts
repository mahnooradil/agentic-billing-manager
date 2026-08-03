/**
 * Prospeo billing adapter.
 *
 * `GET /account-information` (self-scoped) is expected to return the
 * account's own remaining credits, but the exact field name isn't
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ProspeoAccountInformationResponse {
  credits?: number;
  data?: { credits?: number };
}

export const prospeoBillingAdapter: BillingSyncAdapter = {
  platform: "prospeo",
  label: "Prospeo",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.prospeo.io/account-information"
    )) as ProspeoAccountInformationResponse | null;

    const credits = res?.credits ?? res?.data?.credits;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `prospeo-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Prospeo — remaining credits (credits, not currency).",
      },
    ];
  },
};
