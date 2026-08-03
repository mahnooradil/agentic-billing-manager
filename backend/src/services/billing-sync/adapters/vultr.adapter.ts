/**
 * Vultr billing adapter.
 *
 * `GET /v2/account` (self-scoped) returns the account's balance and pending
 * charges directly — no id-discovery step needed. One snapshot per day,
 * upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface VultrAccountResponse {
  account?: {
    balance?: number;
    pending_charges?: number;
  };
}

export const vultrBillingAdapter: BillingSyncAdapter = {
  platform: "vultr",
  label: "Vultr",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.vultr.com/v2/account"
    )) as VultrAccountResponse | null;

    const pending = data?.account?.pending_charges;
    if (typeof pending !== "number" || pending <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `vultr-${day}`,
        amount: pending,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Vultr — pending charges this cycle.",
      },
    ];
  },
};
