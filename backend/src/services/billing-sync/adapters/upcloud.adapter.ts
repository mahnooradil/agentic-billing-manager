/**
 * UpCloud billing adapter.
 *
 * `GET /1.3/account` (self-scoped) returns the account's `credits` field —
 * UpCloud denominates this directly in EUR (1 credit = €1), not an
 * abstract quota, so it's treated as a real currency balance. One
 * snapshot per day, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface UpCloudAccountResponse {
  account?: {
    credits?: number;
  };
}

export const upcloudBillingAdapter: BillingSyncAdapter = {
  platform: "upcloud",
  label: "UpCloud",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.upcloud.com/1.3/account"
    )) as UpCloudAccountResponse | null;

    const credits = data?.account?.credits;
    if (typeof credits !== "number") return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `upcloud-${day}`,
        amount: credits,
        currency: "EUR",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from UpCloud — account balance.",
      },
    ];
  },
};
