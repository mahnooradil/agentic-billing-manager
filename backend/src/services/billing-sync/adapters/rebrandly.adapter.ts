/**
 * Rebrandly billing adapter.
 *
 * `GET /v1/account` (self-scoped) is expected to return the account's own
 * link-quota usage vs. limit under a subscription/limits object; remaining
 * is derived (limit - used). The exact field shape isn't confirmed
 * against a live response, so this parses defensively and returns `[]`
 * rather than guessing a wrong number. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface RebrandlyLinksLimit {
  used?: number;
  total?: number;
}

interface RebrandlyAccountResponse {
  subscription?: { limits?: { links?: RebrandlyLinksLimit } };
}

export const rebrandlyBillingAdapter: BillingSyncAdapter = {
  platform: "rebrandly",
  label: "Rebrandly",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.rebrandly.com/v1/account"
    )) as RebrandlyAccountResponse | null;

    const links = data?.subscription?.limits?.links;
    if (typeof links?.total !== "number" || typeof links?.used !== "number") return [];

    const remaining = links.total - links.used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `rebrandly-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Rebrandly — remaining link quota (credits, not currency).",
      },
    ];
  },
};
