/**
 * ScrapeCreators billing adapter.
 *
 * `GET /account/credit-balance` (self-scoped) is expected to return the
 * account's own remaining credits, but neither the exact base domain nor
 * the field name is confirmed against a live response — this parses
 * defensively and returns `[]` rather than guessing a wrong number.
 * Recorded with a non-currency `CRD` code (see elevenlabs.adapter.ts) —
 * always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ScrapeCreatorsCreditBalanceResponse {
  credits?: number;
  balance?: number;
}

export const scrapecreatorsBillingAdapter: BillingSyncAdapter = {
  platform: "scrapecreators",
  label: "ScrapeCreators",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.scrapecreators.com/account/credit-balance"
    )) as ScrapeCreatorsCreditBalanceResponse | null;

    const credits = data?.credits ?? data?.balance;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `scrapecreators-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from ScrapeCreators — remaining credits (credits, not currency).",
      },
    ];
  },
};
