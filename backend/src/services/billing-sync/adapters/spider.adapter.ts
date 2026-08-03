/**
 * Spider billing adapter.
 *
 * `GET /data/credits` (self-scoped) is expected to return the account's
 * own remaining credits, but the exact field name isn't confirmed against
 * a live response — this parses defensively and returns `[]` rather than
 * guessing a wrong number. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface SpiderCreditsResponse {
  credits?: number;
  balance?: number;
}

export const spiderBillingAdapter: BillingSyncAdapter = {
  platform: "spider",
  label: "Spider",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.spider.cloud/data/credits"
    )) as SpiderCreditsResponse | null;

    const credits = data?.credits ?? data?.balance;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `spider-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Spider — remaining credits (credits, not currency).",
      },
    ];
  },
};
