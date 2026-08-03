/**
 * DigitalOcean billing adapter.
 *
 * `GET /v2/customers/my/balance` (self-scoped, no account id needed) returns
 * the account's month-to-date balance owed. Like BunnyCDN, there is no
 * per-invoice list here, so one record is synced per calendar month, upserted
 * by `externalId` — a re-sync during the same month UPDATES that month's
 * running total rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface DigitalOceanBalanceResponse {
  month_to_date_balance?: string;
  generated_at?: string;
}

export const digitaloceanBillingAdapter: BillingSyncAdapter = {
  platform: "digital_ocean",
  label: "DigitalOcean",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.digitalocean.com/v2/customers/my/balance"
    )) as DigitalOceanBalanceResponse | null;

    const amount = Number(data?.month_to_date_balance);
    if (!Number.isFinite(amount)) return [];

    const now = data?.generated_at ? new Date(data.generated_at) : new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `digital_ocean-${period}`,
        amount,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from DigitalOcean — month-to-date balance.",
      },
    ];
  },
};
