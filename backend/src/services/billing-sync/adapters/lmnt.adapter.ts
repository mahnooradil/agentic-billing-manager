/**
 * LMNT billing adapter.
 *
 * `GET /v1/account` (self-scoped) is expected to return the account's own
 * character usage vs. limit; remaining is derived (limit - used). The
 * exact field names aren't confirmed against a live response, so this
 * parses defensively and returns `[]` rather than guessing a wrong
 * number. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface LmntAccountResponse {
  characters_used?: number;
  character_limit?: number;
}

export const lmntBillingAdapter: BillingSyncAdapter = {
  platform: "lmnt",
  label: "LMNT",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.lmnt.com/v1/account"
    )) as LmntAccountResponse | null;

    const limit = data?.character_limit;
    const used = data?.characters_used;
    if (typeof limit !== "number" || typeof used !== "number") return [];

    const remaining = limit - used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `lmnt-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from LMNT — remaining character quota (credits, not currency).",
      },
    ];
  },
};
