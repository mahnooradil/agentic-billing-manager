/**
 * Phaxio billing adapter.
 *
 * `GET /v2/account/status` (self-scoped) is expected to return the
 * account's own balance, but the exact field name isn't confirmed against
 * a live response — this parses defensively and returns `[]` rather than
 * guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface PhaxioAccountStatusResponse {
  data?: { balance?: number };
}

export const phaxioBillingAdapter: BillingSyncAdapter = {
  platform: "phaxio",
  label: "Phaxio",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.phaxio.com/v2/account/status"
    )) as PhaxioAccountStatusResponse | null;

    const balance = res?.data?.balance;
    if (typeof balance !== "number" || balance <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `phaxio-${day}`,
        amount: balance,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Phaxio — account balance.",
      },
    ];
  },
};
