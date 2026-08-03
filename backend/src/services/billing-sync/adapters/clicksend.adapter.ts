/**
 * ClickSend billing adapter.
 *
 * `GET /v3/account` (self-scoped) returns the account's own balance
 * directly — no id-discovery step needed. One snapshot per day, upserted
 * by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ClickSendAccountResponse {
  data?: {
    balance?: number;
    currency?: string;
  };
}

export const clicksendBillingAdapter: BillingSyncAdapter = {
  platform: "clicksend",
  label: "ClickSend",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://rest.clicksend.com/v3/account"
    )) as ClickSendAccountResponse | null;

    const balance = data?.data?.balance;
    if (typeof balance !== "number") return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `clicksend-${day}`,
        amount: balance,
        currency: (data?.data?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from ClickSend — account balance.",
      },
    ];
  },
};
