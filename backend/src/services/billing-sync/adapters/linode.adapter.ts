/**
 * Linode (Akamai Cloud Computing) billing adapter.
 *
 * `GET /v4/account` (self-scoped) returns the account's current balance
 * directly — no id-discovery step needed. One snapshot per day, upserted
 * by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface LinodeAccountResponse {
  balance?: number;
  balance_uninvoiced?: number;
}

export const linodeBillingAdapter: BillingSyncAdapter = {
  platform: "linode",
  label: "Linode",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const account = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.linode.com/v4/account"
    )) as LinodeAccountResponse | null;

    const amount = account?.balance;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `linode-${day}`,
        amount,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Linode — current account balance.",
      },
    ];
  },
};
