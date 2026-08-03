/**
 * HeyGen billing adapter.
 *
 * `GET /v2/user/remaining_quota` (self-scoped) returns the account's own
 * remaining quota. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts for why) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface HeyGenRemainingQuotaResponse {
  data?: { remaining_quota?: number };
}

export const heygenBillingAdapter: BillingSyncAdapter = {
  platform: "heygen",
  label: "HeyGen",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.heygen.com/v2/user/remaining_quota"
    )) as HeyGenRemainingQuotaResponse | null;

    const quota = res?.data?.remaining_quota;
    if (typeof quota !== "number" || quota <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `heygen-${day}`,
        amount: quota,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from HeyGen — remaining quota (credits, not currency).",
      },
    ];
  },
};
