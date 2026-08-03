/**
 * Scrapeless billing adapter.
 *
 * `GET /api/v1/me` (self-scoped) is expected to return the account's own
 * remaining credits, but neither the exact base domain nor the field name
 * is confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ScrapelessMeResponse {
  credits?: number;
  balance?: number;
}

export const scrapelessBillingAdapter: BillingSyncAdapter = {
  platform: "scrapeless",
  label: "Scrapeless",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.scrapeless.com/api/v1/me"
    )) as ScrapelessMeResponse | null;

    const credits = data?.credits ?? data?.balance;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `scrapeless-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Scrapeless — remaining credits (credits, not currency).",
      },
    ];
  },
};
