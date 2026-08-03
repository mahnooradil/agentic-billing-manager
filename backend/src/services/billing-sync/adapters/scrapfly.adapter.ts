/**
 * Scrapfly billing adapter.
 *
 * `GET /account` (self-scoped) is expected to return the account's own
 * scrape usage vs. limit, but the exact field shape isn't confirmed
 * against a live response — this parses defensively across the plausible
 * shapes and returns `[]` rather than guessing a wrong number. Recorded
 * with a non-currency `CRD` code (see elevenlabs.adapter.ts) — always
 * synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ScrapflyScrapeUsage {
  used?: number;
  limit?: number;
  remaining?: number;
}

interface ScrapflyAccountResponse {
  usage?: { scrape?: ScrapflyScrapeUsage };
}

export const scrapflyBillingAdapter: BillingSyncAdapter = {
  platform: "scrapfly",
  label: "Scrapfly",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.scrapfly.io/account"
    )) as ScrapflyAccountResponse | null;

    const scrape = data?.usage?.scrape;
    const remaining =
      scrape?.remaining ??
      (typeof scrape?.limit === "number" && typeof scrape?.used === "number"
        ? scrape.limit - scrape.used
        : undefined);

    if (typeof remaining !== "number" || remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `scrapfly-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Scrapfly — remaining scrape quota (credits, not currency).",
      },
    ];
  },
};
