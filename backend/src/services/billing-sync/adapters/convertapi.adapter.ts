/**
 * ConvertAPI billing adapter.
 *
 * `GET /user` (self-scoped) is expected to return the account's own
 * remaining conversion credits, but the exact field name isn't confirmed
 * against a live response — this parses defensively and returns `[]`
 * rather than guessing a wrong number. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface ConvertApiUserResponse {
  ConversionsRemaining?: number;
}

export const convertapiBillingAdapter: BillingSyncAdapter = {
  platform: "convertapi",
  label: "ConvertAPI",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://v2.convertapi.com/user"
    )) as ConvertApiUserResponse | null;

    const remaining = data?.ConversionsRemaining;
    if (typeof remaining !== "number" || remaining <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `convertapi-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from ConvertAPI — remaining conversion credits (credits, not currency).",
      },
    ];
  },
};
