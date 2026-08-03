/**
 * Vonage billing adapter.
 *
 * `GET /account/get-balance` (base `https://rest.nexmo.com`, self-scoped —
 * Vonage's account API is still served from the legacy Nexmo host) returns
 * the account's current prepaid balance in EUR. One record is synced per
 * calendar month, upserted by `externalId` — a re-sync during the same month
 * UPDATES that month's snapshot rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface VonageBalanceResponse {
  value?: number;
}

export const vonageBillingAdapter: BillingSyncAdapter = {
  platform: "vonage",
  label: "Vonage",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://rest.nexmo.com/account/get-balance"
    )) as VonageBalanceResponse | null;

    const amount = data?.value;
    if (typeof amount !== "number") return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `vonage-${period}`,
        amount,
        currency: "EUR",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Vonage — current account balance.",
      },
    ];
  },
};
