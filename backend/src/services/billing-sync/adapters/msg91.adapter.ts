/**
 * MSG91 billing adapter.
 *
 * `GET /api/balance.php` (self-scoped) is expected to return the
 * account's own SMS wallet balance, but the exact response format isn't
 * confirmed against a live response (this legacy endpoint may return
 * plain text rather than JSON, in which case this safely parses to
 * nothing) — this parses defensively and returns `[]` rather than
 * guessing a wrong number. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface Msg91BalanceResponse {
  balance?: number | string;
  type?: string;
}

export const msg91BillingAdapter: BillingSyncAdapter = {
  platform: "msg91",
  label: "MSG91",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.msg91.com/api/balance.php"
    )) as Msg91BalanceResponse | null;

    const amount = Number(data?.balance);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `msg91-${day}`,
        amount,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from MSG91 — wallet balance (credits, not currency).",
      },
    ];
  },
};
