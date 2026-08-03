/**
 * Snapchat Marketing (Snapchat Ads) billing adapter.
 *
 * Three calls, each self-scoped from the previous one's result (no ids
 * known up front): `GET /v1/me/organizations` → first org id →
 * `GET /v1/organizations/{id}/adaccounts` → first ad account id →
 * `GET /v1/adaccounts/{id}/invoices` for that ad account's invoices. Each
 * invoice becomes one record, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface SnapOrgsResponse {
  organizations?: { organization?: { id?: string } }[];
}
interface SnapAdAccountsResponse {
  adaccounts?: { adaccount?: { id?: string } }[];
}
interface SnapInvoice {
  id?: string;
  amount_due_micro?: number;
  currency?: string;
  status?: string;
  date_start?: string;
  date_end?: string;
}
interface SnapInvoicesResponse {
  invoices?: SnapInvoice[];
}

function statusFor(status: string | undefined): "Pending" | "Paid" | "Overdue" {
  const normalized = status?.toUpperCase();
  if (normalized === "PAID") return "Paid";
  if (normalized === "OVERDUE" || normalized === "FAILED") return "Overdue";
  return "Pending";
}

export const snapchatMarketingBillingAdapter: BillingSyncAdapter = {
  platform: "snapchat_marketing",
  label: "Snapchat Marketing",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const orgs = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://adsapi.snapchat.com/v1/me/organizations"
    )) as SnapOrgsResponse | null;

    const orgId = orgs?.organizations?.[0]?.organization?.id;
    if (!orgId) return [];

    const adAccounts = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://adsapi.snapchat.com/v1/organizations/${orgId}/adaccounts`
    )) as SnapAdAccountsResponse | null;

    const adAccountId = adAccounts?.adaccounts?.[0]?.adaccount?.id;
    if (!adAccountId) return [];

    const invoices = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/invoices`
    )) as SnapInvoicesResponse | null;

    return (invoices?.invoices ?? [])
      .filter((inv) => inv.id && typeof inv.amount_due_micro === "number")
      .map((inv) => ({
        externalId: `snapchat_marketing-${inv.id}`,
        amount: (inv.amount_due_micro as number) / 1_000_000,
        currency: inv.currency?.toUpperCase() || "USD",
        billingDate: new Date(inv.date_end ?? inv.date_start ?? Date.now()),
        status: statusFor(inv.status),
        notes: "Auto-synced from Snapchat Ads — ad account invoice.",
      }));
  },
};
