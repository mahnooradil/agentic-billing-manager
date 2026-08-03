/**
 * Serpdog billing adapter.
 *
 * `GET /account_info` (self-scoped) is expected to return the account's
 * own remaining search credits, but neither the exact base domain nor the
 * field name is confirmed against a live response — this parses
 * defensively and returns `[]` rather than guessing a wrong number.
 * Recorded with a non-currency `CRD` code (see elevenlabs.adapter.ts) —
 * always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface SerpdogAccountInfoResponse {
  remaining_searches?: number;
  credits?: number;
}

export const serpdogBillingAdapter: BillingSyncAdapter = {
  platform: "serpdog",
  label: "Serpdog",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.serpdog.io/account_info"
    )) as SerpdogAccountInfoResponse | null;

    const remaining = data?.remaining_searches ?? data?.credits;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `serpdog-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Serpdog — remaining search credits (credits, not currency).",
      },
    ];
  },
};
