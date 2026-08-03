/**
 * Grafana Cloud billing adapter.
 *
 * Two calls: `GET /api/orgs` (self-scoped, no id needed) to discover the
 * connected account's own org, then `GET /api/orgs/{slug}/usage/billed-usage`
 * for the current month's billed cost. One record per month, upserted by
 * `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface GrafanaOrg {
  slug?: string;
}

interface GrafanaBilledUsageResponse {
  totalCost?: number;
  cost?: number;
  currency?: string;
}

export const grafanaBillingAdapter: BillingSyncAdapter = {
  platform: "grafana",
  label: "Grafana Cloud",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const orgs = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://grafana.com/api/orgs"
    )) as GrafanaOrg[] | null;

    const slug = orgs?.[0]?.slug;
    if (!slug) return [];

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const usage = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://grafana.com/api/orgs/${slug}/usage/billed-usage?month=${month}&year=${year}`
    )) as GrafanaBilledUsageResponse | null;

    const amount = usage?.totalCost ?? usage?.cost;
    if (typeof amount !== "number") return [];

    const period = `${year}-${String(month).padStart(2, "0")}`;

    return [
      {
        externalId: `grafana-${period}`,
        amount,
        currency: usage?.currency?.toUpperCase() || "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Grafana Cloud — billed usage this month.",
      },
    ];
  },
};
