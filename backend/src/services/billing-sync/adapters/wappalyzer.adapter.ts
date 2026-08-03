/**
 * Wappalyzer billing adapter.
 *
 * `GET /v2/credits/balance` (self-scoped) is expected to return the
 * account's own remaining credit balance, but the exact field name isn't
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface WappalyzerCreditsBalanceResponse {
  balance?: number;
  credits?: number;
}

export const wappalyzerBillingAdapter: BillingSyncAdapter = {
  platform: "wappalyzer",
  label: "Wappalyzer",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.wappalyzer.com/v2/credits/balance"
    )) as WappalyzerCreditsBalanceResponse | null;

    const amount = data?.balance ?? data?.credits;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `wappalyzer-${day}`,
        amount,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Wappalyzer — remaining credit balance (credits, not currency).",
      },
    ];
  },
};
