/**
 * PhantomBuster billing adapter.
 *
 * `GET /api/v2/orgs/fetch-resources` (self-scoped) is expected to return
 * the org's own remaining credit balance, but the exact field name isn't
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface PhantomBusterResourcesResponse {
  executionTimeLeft?: number;
  balance?: number;
}

export const phantombusterBillingAdapter: BillingSyncAdapter = {
  platform: "phantombuster",
  label: "PhantomBuster",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.phantombuster.com/api/v2/orgs/fetch-resources"
    )) as PhantomBusterResourcesResponse | null;

    const amount = data?.executionTimeLeft ?? data?.balance;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `phantombuster-${day}`,
        amount,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from PhantomBuster — remaining credits (credits, not currency).",
      },
    ];
  },
};
