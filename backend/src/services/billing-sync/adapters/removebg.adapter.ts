/**
 * remove.bg billing adapter.
 *
 * `GET /v1.0/account` (self-scoped) returns the account's own remaining
 * image credits. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface RemoveBgAccountResponse {
  data?: { attributes?: { credits?: { total?: number } } };
}

export const removebgBillingAdapter: BillingSyncAdapter = {
  platform: "remove_bg",
  label: "remove.bg",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.remove.bg/v1.0/account"
    )) as RemoveBgAccountResponse | null;

    const credits = res?.data?.attributes?.credits?.total;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `remove_bg-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from remove.bg — remaining credits (credits, not currency).",
      },
    ];
  },
};
