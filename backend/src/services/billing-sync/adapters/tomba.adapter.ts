/**
 * Tomba billing adapter.
 *
 * `GET /v1/me` (self-scoped) is expected to return the account's own
 * remaining request credits under a `pricing` object, but the exact field
 * name isn't confirmed against a live response — this parses defensively
 * and returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TombaMeResponse {
  data?: {
    pricing?: {
      available_searches?: number;
      available_verifications?: number;
    };
  };
}

export const tombaBillingAdapter: BillingSyncAdapter = {
  platform: "tomba",
  label: "Tomba",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.tomba.io/v1/me"
    )) as TombaMeResponse | null;

    const pricing = res?.data?.pricing;
    const available = pricing?.available_searches ?? pricing?.available_verifications;
    if (typeof available !== "number" || available <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `tomba-${day}`,
        amount: available,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Tomba — remaining credits (credits, not currency).",
      },
    ];
  },
};
