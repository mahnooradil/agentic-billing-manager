/**
 * Scrapingdog billing adapter.
 *
 * `GET /account` (self-scoped) is expected to return the account's own
 * request usage vs. limit; remaining is derived (limit - used). The exact
 * field names aren't confirmed against a live response, so this parses
 * defensively and returns `[]` rather than guessing a wrong number.
 * Recorded with a non-currency `CRD` code (see elevenlabs.adapter.ts) —
 * always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ScrapingdogAccountResponse {
  requestLimit?: number;
  requestUsed?: number;
}

export const scrapingdogBillingAdapter: BillingSyncAdapter = {
  platform: "scrapingdog",
  label: "Scrapingdog",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.scrapingdog.com/account"
    )) as ScrapingdogAccountResponse | null;

    const limit = data?.requestLimit;
    const used = data?.requestUsed;
    if (typeof limit !== "number" || typeof used !== "number") return [];

    const remaining = limit - used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `scrapingdog-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Scrapingdog — remaining request quota (credits, not currency).",
      },
    ];
  },
};
