/**
 * ViewDNS.info billing adapter.
 *
 * `GET /account/?action=balance` (self-scoped) is expected to return the
 * account's own remaining credit balance, but the exact field name isn't
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ViewDnsAccountResponse {
  credits_remaining?: number;
  balance?: number;
}

export const viewdnsBillingAdapter: BillingSyncAdapter = {
  platform: "viewdns_info",
  label: "ViewDNS.info",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.viewdns.info/account/?action=balance"
    )) as ViewDnsAccountResponse | null;

    const amount = data?.credits_remaining ?? data?.balance;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `viewdns_info-${day}`,
        amount,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from ViewDNS.info — remaining credit balance (credits, not currency).",
      },
    ];
  },
};
