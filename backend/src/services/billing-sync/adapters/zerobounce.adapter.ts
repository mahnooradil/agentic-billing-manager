/**
 * ZeroBounce billing adapter.
 *
 * `GET /v2/getcredits` (self-scoped) returns the account's own remaining
 * credits. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ZeroBounceCreditsResponse {
  Credits?: string | number;
  credits?: string | number;
}

export const zerobounceBillingAdapter: BillingSyncAdapter = {
  platform: "zerobounce",
  label: "ZeroBounce",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.zerobounce.net/v2/getcredits"
    )) as ZeroBounceCreditsResponse | null;

    const credits = Number(data?.Credits ?? data?.credits);
    if (!Number.isFinite(credits) || credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `zerobounce-${day}`,
        amount: credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from ZeroBounce — remaining credits (credits, not currency).",
      },
    ];
  },
};
