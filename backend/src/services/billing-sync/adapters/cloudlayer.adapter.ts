/**
 * Cloudlayer.io billing adapter.
 *
 * `GET /v2/account` (self-scoped) is expected to return the account's own
 * remaining credits, but the exact field name isn't confirmed against a
 * live response — this parses defensively and returns `[]` rather than
 * guessing a wrong number. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface CloudlayerAccountResponse {
  credits?: number;
  balance?: number;
}

export const cloudlayerBillingAdapter: BillingSyncAdapter = {
  platform: "cloudlayer",
  label: "Cloudlayer.io",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.cloudlayer.io/v2/account"
    )) as CloudlayerAccountResponse | null;

    const credits = data?.credits ?? data?.balance;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `cloudlayer-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Cloudlayer.io — remaining credits (credits, not currency).",
      },
    ];
  },
};
