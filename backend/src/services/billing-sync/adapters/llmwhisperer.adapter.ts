/**
 * LLMWhisperer billing adapter.
 *
 * `GET /api/v2/get-usage-info` (self-scoped) is expected to return the
 * account's own remaining page quota, but the exact field name isn't
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface LlmWhispererUsageInfoResponse {
  remaining_pages?: number;
  pages_remaining?: number;
}

export const llmwhispererBillingAdapter: BillingSyncAdapter = {
  platform: "llmwhisperer",
  label: "LLMWhisperer",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://llmwhisperer-api.unstract.com/api/v2/get-usage-info"
    )) as LlmWhispererUsageInfoResponse | null;

    const remaining = data?.remaining_pages ?? data?.pages_remaining;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `llmwhisperer-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from LLMWhisperer — remaining page quota (credits, not currency).",
      },
    ];
  },
};
