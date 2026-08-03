/**
 * PrintNode billing adapter.
 *
 * `GET /whoami` (self-scoped) returns the account's current credit balance
 * (a plain dollar figure in PrintNode's pay-as-you-go system). One record is
 * synced per calendar month, upserted by `externalId` — a re-sync during the
 * same month UPDATES that month's snapshot rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface PrintNodeWhoamiResponse {
  credits?: number;
}

export const printnodeBillingAdapter: BillingSyncAdapter = {
  platform: "printnode",
  label: "PrintNode",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.printnode.com/whoami"
    )) as PrintNodeWhoamiResponse | null;

    const amount = data?.credits;
    if (typeof amount !== "number") return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `printnode-${period}`,
        amount,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from PrintNode — current account credit balance.",
      },
    ];
  },
};
