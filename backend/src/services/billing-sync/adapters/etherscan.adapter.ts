/**
 * Etherscan billing adapter.
 *
 * `GET /v2/api?module=account&action=getapilimit` (self-scoped) is
 * expected to return the account's own remaining daily API credits, but
 * the exact module/action combination and field shape aren't confirmed
 * against a live response — this parses defensively and returns `[]`
 * rather than guessing a wrong number. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface EtherscanApiLimitResponse {
  result?: {
    creditsUsed?: number;
    creditsAvailable?: number;
    creditLimit?: number;
  };
}

export const etherscanBillingAdapter: BillingSyncAdapter = {
  platform: "ethereum",
  label: "Etherscan",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.etherscan.io/v2/api?module=account&action=getapilimit"
    )) as EtherscanApiLimitResponse | null;

    const result = data?.result;
    const remaining =
      result?.creditsAvailable ??
      (typeof result?.creditLimit === "number" && typeof result?.creditsUsed === "number"
        ? result.creditLimit - result.creditsUsed
        : undefined);

    if (typeof remaining !== "number" || remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `ethereum-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Etherscan — remaining daily API credits (credits, not currency).",
      },
    ];
  },
};
