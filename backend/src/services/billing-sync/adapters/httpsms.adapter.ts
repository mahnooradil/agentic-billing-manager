/**
 * httpSMS billing adapter.
 *
 * `GET /v1/billing/usage` (self-scoped) is expected to return the
 * account's own remaining usage balance, but the exact field name isn't
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface HttpSmsBillingUsageResponse {
  data?: { remaining?: number; balance?: number };
}

export const httpsmsBillingAdapter: BillingSyncAdapter = {
  platform: "httpsms",
  label: "httpSMS",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.httpsms.com/v1/billing/usage"
    )) as HttpSmsBillingUsageResponse | null;

    const amount = res?.data?.remaining ?? res?.data?.balance;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `httpsms-${day}`,
        amount,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from httpSMS — remaining balance (credits, not currency).",
      },
    ];
  },
};
