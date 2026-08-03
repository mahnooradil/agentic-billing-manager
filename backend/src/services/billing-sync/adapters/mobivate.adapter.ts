/**
 * Mobivate billing adapter.
 *
 * `GET /wallet` is expected to return the account's own SMS wallet
 * balance, but neither the exact base domain nor the field name is
 * confirmed against a live response — this parses defensively and
 * returns `[]` rather than guessing a wrong number. Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface MobivateWalletResponse {
  balance?: number;
  credits?: number;
}

export const mobivateBillingAdapter: BillingSyncAdapter = {
  platform: "mobivate",
  label: "Mobivate",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.mobivate.com/wallet"
    )) as MobivateWalletResponse | null;

    const amount = data?.balance ?? data?.credits;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `mobivate-${day}`,
        amount,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Mobivate — wallet balance (credits, not currency).",
      },
    ];
  },
};
