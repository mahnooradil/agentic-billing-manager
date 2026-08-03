/**
 * pCloud billing adapter.
 *
 * `GET /userinfo` (self-scoped) returns the account's own storage quota
 * vs. used space; remaining is derived (quota - used). This is a storage
 * quota, not a purchased credit balance, but is recorded the same way —
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface PcloudUserInfoResponse {
  quota?: number;
  usedquota?: number;
}

export const pcloudBillingAdapter: BillingSyncAdapter = {
  platform: "pcloud",
  label: "pCloud",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.pcloud.com/userinfo"
    )) as PcloudUserInfoResponse | null;

    const quota = data?.quota;
    const used = data?.usedquota;
    if (typeof quota !== "number" || typeof used !== "number") return [];

    const remainingBytes = quota - used;
    if (remainingBytes < 0) return [];
    const remainingGb = Math.round((remainingBytes / 1_073_741_824) * 100) / 100;

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `pcloud-${day}`,
        amount: remainingGb,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from pCloud — remaining storage quota in GB (not currency).",
      },
    ];
  },
};
