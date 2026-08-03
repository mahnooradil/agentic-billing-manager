/**
 * GTmetrix billing adapter.
 *
 * `GET /api/2.0/status` (self-scoped) is expected to return the account's
 * own remaining API credits, but the exact field shape isn't confirmed
 * against a live response — this parses defensively across the plausible
 * shapes and returns `[]` rather than guessing a wrong number. Recorded
 * with a non-currency `CRD` code (see elevenlabs.adapter.ts) — always
 * synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface GtmetrixStatusResponse {
  data?: { attributes?: { api_credits?: number } };
  api_credits?: number;
}

export const gtmetrixBillingAdapter: BillingSyncAdapter = {
  platform: "gtmetrix",
  label: "GTmetrix",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://gtmetrix.com/api/2.0/status"
    )) as GtmetrixStatusResponse | null;

    const credits = res?.data?.attributes?.api_credits ?? res?.api_credits;
    if (typeof credits !== "number" || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `gtmetrix-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from GTmetrix — remaining API credits (credits, not currency).",
      },
    ];
  },
};
