/**
 * Heroku billing adapter.
 *
 * `GET /invoices` (self-scoped to the authenticated account) requires
 * Heroku's versioned Accept header. Each invoice becomes one record,
 * upserted by `externalId` — a re-sync UPDATES an invoice (e.g. once it
 * moves from pending to paid) rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface HerokuInvoice {
  id?: string;
  number?: number;
  total?: number;
  state?: number;
  period_end?: string;
  created_at?: string;
}

/** Heroku's invoice `state`: 0 pending, 1 pending payment, 2 paid, 3 past due. */
function statusFor(state: number | undefined): "Pending" | "Paid" | "Overdue" {
  if (state === 2) return "Paid";
  if (state === 3) return "Overdue";
  return "Pending";
}

export const herokuBillingAdapter: BillingSyncAdapter = {
  platform: "heroku",
  label: "Heroku",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const invoices = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.heroku.com/invoices",
      { headers: { Accept: "application/vnd.heroku+json; version=3" } }
    )) as HerokuInvoice[] | null;

    return (invoices ?? [])
      .filter((inv) => inv.id && typeof inv.total === "number")
      .map((inv) => ({
        externalId: `heroku-${inv.id}`,
        amount: (inv.total as number) / 100,
        currency: "USD",
        billingDate: new Date(inv.period_end ?? inv.created_at ?? Date.now()),
        status: statusFor(inv.state),
        notes: `Auto-synced from Heroku — invoice #${inv.number ?? inv.id}.`,
      }));
  },
};
