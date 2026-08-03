/**
 * Northflank billing adapter.
 *
 * `GET /v1/billing/invoices` (self-scoped to the connected token's default
 * team) lists finalized invoices. Each invoice becomes one record, upserted
 * by `externalId` — a re-sync UPDATES an invoice rather than duplicating it.
 * Field names are the best-documented shape at build time; if Northflank's
 * actual response differs, this safely syncs nothing rather than guessing.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface NorthflankInvoice {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  paidAt?: string;
}

interface NorthflankInvoicesResponse {
  data?: { invoices?: NorthflankInvoice[] } | NorthflankInvoice[];
}

function statusFor(status: string | undefined): "Pending" | "Paid" | "Overdue" {
  const normalized = status?.toLowerCase();
  if (normalized === "paid") return "Paid";
  if (normalized === "overdue" || normalized === "failed") return "Overdue";
  return "Pending";
}

export const northflankBillingAdapter: BillingSyncAdapter = {
  platform: "northflank",
  label: "Northflank",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.northflank.com/v1/billing/invoices"
    )) as NorthflankInvoicesResponse | null;

    const raw = data?.data;
    const invoices: NorthflankInvoice[] = Array.isArray(raw)
      ? raw
      : (raw?.invoices ?? []);

    return invoices
      .filter((inv) => inv.id && typeof inv.amount === "number")
      .map((inv) => ({
        externalId: `northflank-${inv.id}`,
        amount: inv.amount as number,
        currency: inv.currency?.toUpperCase() || "USD",
        billingDate: new Date(inv.paidAt ?? inv.createdAt ?? Date.now()),
        status: statusFor(inv.status),
        notes: "Auto-synced from Northflank — team invoice.",
      }));
  },
};
