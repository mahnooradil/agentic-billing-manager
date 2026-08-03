/**
 * Bird (MessageBird) billing adapter.
 *
 * `GET /balance` (self-scoped, legacy REST API — still the account's live
 * balance under the Bird rebrand) returns the account's remaining balance.
 * The endpoint doesn't return a currency code; MessageBird/Bird accounts
 * default to EUR billing, so that's used unless a future response shape
 * adds one. One snapshot per day, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface MessageBirdBalanceResponse {
  amount?: number;
  type?: string;
}

export const messagebirdBillingAdapter: BillingSyncAdapter = {
  platform: "messagebird",
  label: "Bird (MessageBird)",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://rest.messagebird.com/balance"
    )) as MessageBirdBalanceResponse | null;

    if (typeof data?.amount !== "number") return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `messagebird-${day}`,
        amount: data.amount,
        currency: "EUR",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Bird (MessageBird) — account balance.",
      },
    ];
  },
};
