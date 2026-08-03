/**
 * Templated billing adapter.
 *
 * `GET /v1/account` (self-scoped) is expected to return the account's own
 * API quota vs. usage; remaining is derived (quota - usage). The exact
 * field names aren't confirmed against a live response, so this parses
 * defensively and returns `[]` rather than guessing a wrong number.
 * Recorded with a non-currency `CRD` code (see elevenlabs.adapter.ts) —
 * always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface TemplatedAccountResponse {
  apiQuota?: number;
  apiUsage?: number;
}

export const templatedBillingAdapter: BillingSyncAdapter = {
  platform: "templated",
  label: "Templated",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.templated.io/v1/account"
    )) as TemplatedAccountResponse | null;

    const quota = data?.apiQuota;
    const usage = data?.apiUsage;
    if (typeof quota !== "number" || typeof usage !== "number") return [];

    const remaining = quota - usage;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `templated-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Templated — remaining API quota (credits, not currency).",
      },
    ];
  },
};
