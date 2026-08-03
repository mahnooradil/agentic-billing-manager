/**
 * ElevenLabs billing adapter.
 *
 * `GET /v1/user/subscription` (self-scoped) returns the account's own
 * character quota. There is no dollar figure here — this is a credit/quota
 * balance, so it's recorded with a non-currency `CRD` code (never mixed
 * into real-currency totals like the dashboard's Total Revenue, which
 * only sums Paid records anyway — this always syncs as Pending).
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ElevenLabsSubscriptionResponse {
  character_count?: number;
  character_limit?: number;
}

export const elevenlabsBillingAdapter: BillingSyncAdapter = {
  platform: "elevenlabs",
  label: "ElevenLabs",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.elevenlabs.io/v1/user/subscription"
    )) as ElevenLabsSubscriptionResponse | null;

    const limit = data?.character_limit;
    const used = data?.character_count;
    if (typeof limit !== "number" || typeof used !== "number") return [];

    const remaining = limit - used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `elevenlabs-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from ElevenLabs — remaining character quota (credits, not currency).",
      },
    ];
  },
};
