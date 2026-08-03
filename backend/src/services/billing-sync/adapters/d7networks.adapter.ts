/**
 * D7 Networks billing adapter.
 *
 * `GET /messages/v1/balance` (self-scoped) is expected to return the
 * account's own SMS wallet balance, but the exact field name isn't
 * confirmed against a live response — this parses defensively across the
 * plausible field names and returns `[]` rather than guessing a wrong
 * number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface D7NetworksBalanceResponse {
  balance?: number;
  data?: { balance?: number; currency?: string };
  currency?: string;
}

export const d7networksBillingAdapter: BillingSyncAdapter = {
  platform: "d7_networks",
  label: "D7 Networks",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const res = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.d7networks.com/messages/v1/balance"
    )) as D7NetworksBalanceResponse | null;

    const amount = res?.balance ?? res?.data?.balance;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `d7_networks-${day}`,
        amount,
        currency: (res?.currency ?? res?.data?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from D7 Networks — account balance.",
      },
    ];
  },
};
