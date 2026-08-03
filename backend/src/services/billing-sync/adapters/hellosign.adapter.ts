/**
 * Dropbox Sign (HelloSign) billing adapter.
 *
 * `GET /v3/account` (self-scoped) returns the account's own remaining
 * signature-request quota. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface HelloSignAccountResponse {
  account?: { quotas?: { api_signature_requests_left?: number } };
}

export const hellosignBillingAdapter: BillingSyncAdapter = {
  platform: "hellosign",
  label: "Dropbox Sign (HelloSign)",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.hellosign.com/v3/account"
    )) as HelloSignAccountResponse | null;

    const remaining = data?.account?.quotas?.api_signature_requests_left;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `hellosign-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Dropbox Sign — remaining signature requests (credits, not currency).",
      },
    ];
  },
};
