/**
 * Pushover billing adapter.
 *
 * `GET /1/apps/limits.json` (self-scoped) returns the account's own
 * remaining monthly message quota. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface PushoverLimitsResponse {
  remaining?: number;
}

export const pushoverBillingAdapter: BillingSyncAdapter = {
  platform: "pushover",
  label: "Pushover",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.pushover.net/1/apps/limits.json"
    )) as PushoverLimitsResponse | null;

    if (typeof data?.remaining !== "number" || data.remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `pushover-${day}`,
        amount: data.remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Pushover — remaining monthly message quota (credits, not currency).",
      },
    ];
  },
};
