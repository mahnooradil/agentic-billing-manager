/**
 * Interzoid billing adapter.
 *
 * `GET /getremainingcredits` (self-scoped) is expected to return the
 * account's own remaining credits, but the exact field name isn't
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface InterzoidRemainingCreditsResponse {
  Credits?: number | string;
  credits?: number | string;
}

export const interzoidBillingAdapter: BillingSyncAdapter = {
  platform: "interzoid",
  label: "Interzoid",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.interzoid.com/getremainingcredits"
    )) as InterzoidRemainingCreditsResponse | null;

    const credits = Number(data?.Credits ?? data?.credits);
    if (!Number.isFinite(credits) || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `interzoid-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Interzoid — remaining credits (credits, not currency).",
      },
    ];
  },
};
