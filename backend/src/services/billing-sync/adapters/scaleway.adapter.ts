/**
 * Scaleway billing adapter.
 *
 * Two calls: `GET /account/v2/organizations` (self-scoped) to discover the
 * connected account's own organization id, then
 * `GET /billing/v2alpha1/consumptions?organization_id={id}` for the
 * current period's consumption. The exact response shape for the second
 * call isn't confirmed against a live response, so this parses
 * defensively and returns `[]` rather than guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ScalewayOrganization {
  id?: string;
}

interface ScalewayOrganizationsResponse {
  organizations?: ScalewayOrganization[];
}

interface ScalewayConsumptionValue {
  value?: string;
  currency_code?: string;
}

interface ScalewayConsumptionsResponse {
  consumptions?: { value?: ScalewayConsumptionValue }[];
  total?: ScalewayConsumptionValue;
}

export const scalewayBillingAdapter: BillingSyncAdapter = {
  platform: "scaleway",
  label: "Scaleway",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const orgs = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.scaleway.com/account/v2/organizations"
    )) as ScalewayOrganizationsResponse | null;

    const orgId = orgs?.organizations?.[0]?.id;
    if (!orgId) return [];

    const consumptions = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.scaleway.com/billing/v2alpha1/consumptions?organization_id=${orgId}`
    )) as ScalewayConsumptionsResponse | null;

    const totalValue = consumptions?.total?.value;
    const amount = Number(totalValue);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return [
      {
        externalId: `scaleway-${period}`,
        amount,
        currency: consumptions?.total?.currency_code?.toUpperCase() || "EUR",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Scaleway — consumption this period.",
      },
    ];
  },
};
