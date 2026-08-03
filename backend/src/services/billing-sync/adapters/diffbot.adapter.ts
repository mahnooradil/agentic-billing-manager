/**
 * Diffbot billing adapter.
 *
 * `GET /v4/account` (self-scoped) is expected to return the account's own
 * call usage vs. limit; remaining is derived (limit - used). The exact
 * field names aren't confirmed against a live response, so this parses
 * defensively and returns `[]` rather than guessing a wrong number.
 * Recorded with a non-currency `CRD` code (see elevenlabs.adapter.ts) —
 * always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface DiffbotAccountResponse {
  calls?: { used?: number; limit?: number };
}

export const diffbotBillingAdapter: BillingSyncAdapter = {
  platform: "diffbot",
  label: "Diffbot",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.diffbot.com/v4/account"
    )) as DiffbotAccountResponse | null;

    const used = data?.calls?.used;
    const limit = data?.calls?.limit;
    if (typeof used !== "number" || typeof limit !== "number") return [];

    const remaining = limit - used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `diffbot-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Diffbot — remaining call quota (credits, not currency).",
      },
    ];
  },
};
