/**
 * MongoDB Atlas billing adapter.
 *
 * Two calls: `GET /orgs` (self-scoped, no id needed) to discover the
 * connected account's own organization, then `GET /orgs/{orgId}/invoices`
 * for that org's invoices. Each invoice becomes one record, upserted by
 * `externalId` — a re-sync UPDATES an invoice rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

const ATLAS_ACCEPT = "application/vnd.atlas.2023-01-01+json";

interface AtlasOrgsResponse {
  results?: { id?: string }[];
}

interface AtlasInvoice {
  id?: string;
  amountBilledCents?: number;
  currency?: string;
  statusName?: string;
  endDate?: string;
  created?: string;
}

interface AtlasInvoicesResponse {
  results?: AtlasInvoice[];
}

function statusFor(statusName: string | undefined): "Pending" | "Paid" | "Overdue" {
  const normalized = statusName?.toUpperCase();
  if (normalized === "PAID" || normalized === "CLOSED") return "Paid";
  if (normalized === "PAST_DUE" || normalized === "FAILED") return "Overdue";
  return "Pending";
}

export const mongodbBillingAdapter: BillingSyncAdapter = {
  platform: "mongodb",
  label: "MongoDB Atlas",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const orgs = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://cloud.mongodb.com/api/atlas/v2/orgs",
      { headers: { Accept: ATLAS_ACCEPT } }
    )) as AtlasOrgsResponse | null;

    const orgId = orgs?.results?.[0]?.id;
    if (!orgId) return [];

    const invoices = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://cloud.mongodb.com/api/atlas/v2/orgs/${orgId}/invoices`,
      { headers: { Accept: ATLAS_ACCEPT } }
    )) as AtlasInvoicesResponse | null;

    return (invoices?.results ?? [])
      .filter((inv) => inv.id && typeof inv.amountBilledCents === "number")
      .map((inv) => ({
        externalId: `mongodb-${inv.id}`,
        amount: (inv.amountBilledCents as number) / 100,
        currency: inv.currency?.toUpperCase() || "USD",
        billingDate: new Date(inv.endDate ?? inv.created ?? Date.now()),
        status: statusFor(inv.statusName),
        notes: "Auto-synced from MongoDB Atlas — organization invoice.",
      }));
  },
};
