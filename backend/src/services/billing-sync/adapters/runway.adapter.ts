/**
 * Runway billing adapter.
 *
 * `GET /v1/organization` (self-scoped) returns the account's own credit
 * balance. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts for why) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface RunwayOrganizationResponse {
  creditBalance?: number;
}

export const runwayBillingAdapter: BillingSyncAdapter = {
  platform: "runway",
  label: "Runway",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.runwayml.com/v1/organization"
    )) as RunwayOrganizationResponse | null;

    if (typeof data?.creditBalance !== "number" || data.creditBalance <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `runway-${day}`,
        amount: data.creditBalance,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Runway — credit balance (credits, not currency).",
      },
    ];
  },
};
