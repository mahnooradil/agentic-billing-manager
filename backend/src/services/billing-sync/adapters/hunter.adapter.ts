/**
 * Hunter billing adapter.
 *
 * `GET /v2/account` (self-scoped) returns the account's own remaining
 * search credits. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface HunterAccountResponse {
  data?: { calls?: { available?: number } };
}

export const hunterBillingAdapter: BillingSyncAdapter = {
  platform: "hunter",
  label: "Hunter",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.hunter.io/v2/account"
    )) as HunterAccountResponse | null;

    const available = res?.data?.calls?.available;
    if (typeof available !== "number" || available <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `hunter-${day}`,
        amount: available,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Hunter — remaining search credits (credits, not currency).",
      },
    ];
  },
};
