/**
 * TextRazor billing adapter.
 *
 * `GET /account/` (self-scoped) is expected to return the account's own
 * remaining request quota, but the exact field name isn't confirmed
 * against a live response — this parses defensively and returns `[]`
 * rather than guessing a wrong number. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TextRazorAccountResponse {
  concurrentRequestsQuota?: number;
  dailyRequestsUsed?: number;
  dailyRequestsLimit?: number;
}

export const textrazorBillingAdapter: BillingSyncAdapter = {
  platform: "textrazor",
  label: "TextRazor",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.textrazor.com/account/"
    )) as TextRazorAccountResponse | null;

    const limit = data?.dailyRequestsLimit;
    const used = data?.dailyRequestsUsed;
    if (typeof limit !== "number" || typeof used !== "number") return [];

    const remaining = limit - used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `textrazor-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from TextRazor — remaining daily requests (credits, not currency).",
      },
    ];
  },
};
