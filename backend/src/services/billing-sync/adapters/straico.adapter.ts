/**
 * Straico billing adapter.
 *
 * `GET /v0/user` (self-scoped) returns the account's own coin balance.
 * Recorded with a non-currency `CRD` code (see elevenlabs.adapter.ts for
 * why) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface StraicoUserResponse {
  data?: { coins?: number };
}

export const straicoBillingAdapter: BillingSyncAdapter = {
  platform: "straico",
  label: "Straico",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.straico.com/v0/user"
    )) as StraicoUserResponse | null;

    const coins = res?.data?.coins;
    if (typeof coins !== "number" || coins <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `straico-${day}`,
        amount: coins,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Straico — coin balance (credits, not currency).",
      },
    ];
  },
};
