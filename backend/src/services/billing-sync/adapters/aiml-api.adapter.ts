/**
 * AI/ML API billing adapter.
 *
 * `GET /v1/billing/balance` (self-scoped) is expected to return the
 * account's own prepaid balance, but the exact field name isn't confirmed
 * against a live response — this parses defensively and returns `[]`
 * rather than guessing a wrong number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface AimlApiBalanceResponse {
  balance?: number;
  credits?: number;
  currency?: string;
}

export const aimlApiBillingAdapter: BillingSyncAdapter = {
  platform: "aiml_api",
  label: "AI/ML API",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.aimlapi.com/v1/billing/balance"
    )) as AimlApiBalanceResponse | null;

    const amount = data?.balance ?? data?.credits;
    if (typeof amount !== "number" || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `aiml_api-${day}`,
        amount,
        currency: (data?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from AI/ML API — account balance.",
      },
    ];
  },
};
