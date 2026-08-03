/**
 * LabsMobile billing adapter.
 *
 * `GET /get/balance` (self-scoped) is expected to return the account's own
 * SMS balance, but the exact field name isn't confirmed against a live
 * response — this parses defensively across the plausible field names and
 * returns `[]` rather than guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface LabsMobileBalanceResponse {
  balance?: number | string;
  credits?: number | string;
  currency?: string;
}

export const labsmobileBillingAdapter: BillingSyncAdapter = {
  platform: "labsmobile",
  label: "LabsMobile",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.labsmobile.com/get/balance"
    )) as LabsMobileBalanceResponse | null;

    const amount = Number(data?.balance ?? data?.credits);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `labsmobile-${day}`,
        amount,
        currency: (data?.currency ?? "EUR").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from LabsMobile — account balance.",
      },
    ];
  },
};
