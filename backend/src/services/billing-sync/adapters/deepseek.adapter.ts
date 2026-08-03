/**
 * DeepSeek billing adapter.
 *
 * `GET /user/balance` (self-scoped) returns the account's own prepaid
 * balance per currency. One snapshot per currency per day, upserted by
 * `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface DeepSeekBalanceInfo {
  currency?: string;
  total_balance?: string;
}

interface DeepSeekBalanceResponse {
  balance_infos?: DeepSeekBalanceInfo[];
}

export const deepseekBillingAdapter: BillingSyncAdapter = {
  platform: "deepseek",
  label: "DeepSeek",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.deepseek.com/user/balance"
    )) as DeepSeekBalanceResponse | null;

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return (data?.balance_infos ?? [])
      .map((b) => ({ currency: b.currency, value: Number(b.total_balance) }))
      .filter((b) => b.currency && Number.isFinite(b.value) && b.value > 0)
      .map((b) => ({
        externalId: `deepseek-${day}-${b.currency}`,
        amount: b.value,
        currency: (b.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: "Auto-synced from DeepSeek — account balance.",
      }));
  },
};
