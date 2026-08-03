/**
 * DreamStudio (Stability AI) billing adapter.
 *
 * `GET /v1/user/balance` (self-scoped) returns the account's own credit
 * balance. Recorded with a non-currency `CRD` code (see elevenlabs.adapter.ts
 * for why) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface DreamStudioBalanceResponse {
  credits?: number;
}

export const dreamstudioBillingAdapter: BillingSyncAdapter = {
  platform: "dreamstudio",
  label: "DreamStudio (Stability AI)",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.stability.ai/v1/user/balance"
    )) as DreamStudioBalanceResponse | null;

    if (typeof data?.credits !== "number" || data.credits <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `dreamstudio-${day}`,
        amount: data.credits,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from DreamStudio — credit balance (credits, not currency).",
      },
    ];
  },
};
