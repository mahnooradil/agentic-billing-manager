/**
 * Findymail billing adapter.
 *
 * `GET /api/credits` (self-scoped) is expected to return the account's
 * own remaining credits, but the exact field name isn't confirmed against
 * a live response — this parses defensively and returns `[]` rather than
 * guessing a wrong number. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface FindymailCreditsResponse {
  credits?: number;
  remaining_credits?: number;
}

export const findymailBillingAdapter: BillingSyncAdapter = {
  platform: "findymail",
  label: "Findymail",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://app.findymail.com/api/credits"
    )) as FindymailCreditsResponse | null;

    const credits = data?.credits ?? data?.remaining_credits;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `findymail-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Findymail — remaining credits (credits, not currency).",
      },
    ];
  },
};
