/**
 * Vercel billing adapter.
 *
 * `GET /v1/billing/charges` (self-scoped to the connected token's default
 * team/personal account) returns FOCUS-format billing charges. One record
 * per charge, upserted by `externalId` — a re-sync UPDATES each charge
 * rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface VercelCharge {
  BilledCost?: number;
  ChargeDescription?: string;
  ChargeCategory?: string;
  BillingPeriodStart?: string;
}

interface VercelChargesResponse {
  charges?: VercelCharge[];
}

export const vercelBillingAdapter: BillingSyncAdapter = {
  platform: "vercel_token_auth",
  label: "Vercel",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.vercel.com/v1/billing/charges"
    )) as VercelChargesResponse | null;

    const charges = data?.charges ?? [];

    return charges
      .filter((c) => typeof c.BilledCost === "number" && c.BilledCost > 0)
      .map((c, index) => ({
        externalId: `vercel-${c.BillingPeriodStart ?? "period"}-${index}`,
        amount: c.BilledCost as number,
        currency: "USD",
        billingDate: c.BillingPeriodStart ? new Date(c.BillingPeriodStart) : new Date(),
        status: "Pending" as const,
        notes: `Auto-synced from Vercel — ${c.ChargeDescription ?? c.ChargeCategory ?? "billing charge"}.`,
      }));
  },
};
