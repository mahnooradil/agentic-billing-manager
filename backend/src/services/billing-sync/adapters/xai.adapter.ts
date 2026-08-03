/**
 * xAI billing adapter.
 *
 * `GET /v1/prepaid/balance` (self-scoped) is expected to return the
 * account's own prepaid balance, but the exact field name isn't confirmed
 * against a live response — this parses defensively across the plausible
 * field names and returns `[]` rather than guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface XaiPrepaidBalanceResponse {
  balance?: number;
  amount?: number;
  available_balance?: number;
  currency?: string;
}

export const xaiBillingAdapter: BillingSyncAdapter = {
  platform: "x_ai",
  label: "xAI",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.x.ai/v1/prepaid/balance"
    )) as XaiPrepaidBalanceResponse | null;

    const amount = data?.balance ?? data?.amount ?? data?.available_balance;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `x_ai-${day}`,
        amount,
        currency: (data?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from xAI — prepaid balance.",
      },
    ];
  },
};
