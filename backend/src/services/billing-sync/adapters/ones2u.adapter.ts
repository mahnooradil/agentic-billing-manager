/**
 * 1S2U billing adapter.
 *
 * `GET /checkbalance` is expected to return the account's own SMS
 * balance, but neither the exact base domain nor the field name is
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface Ones2uBalanceResponse {
  balance?: number | string;
  credit?: number | string;
}

export const ones2uBillingAdapter: BillingSyncAdapter = {
  platform: "ones2u",
  label: "1S2U",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.ones2u.com/checkbalance"
    )) as Ones2uBalanceResponse | null;

    const amount = Number(data?.balance ?? data?.credit);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `ones2u-${day}`,
        amount,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from 1S2U — account balance (credits, not currency).",
      },
    ];
  },
};
