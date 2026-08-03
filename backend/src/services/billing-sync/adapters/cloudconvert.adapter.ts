/**
 * CloudConvert billing adapter.
 *
 * `GET /v2/users/me` (self-scoped) returns the account's own remaining
 * conversion credits. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface CloudConvertUserResponse {
  data?: { credits?: number };
}

export const cloudconvertBillingAdapter: BillingSyncAdapter = {
  platform: "cloud_convert",
  label: "CloudConvert",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.cloudconvert.com/v2/users/me"
    )) as CloudConvertUserResponse | null;

    const credits = res?.data?.credits;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `cloud_convert-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from CloudConvert — remaining credits (credits, not currency).",
      },
    ];
  },
};
