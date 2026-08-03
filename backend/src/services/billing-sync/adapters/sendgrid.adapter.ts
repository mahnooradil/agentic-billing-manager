/**
 * Twilio SendGrid billing adapter.
 *
 * `GET /v3/user/credits` (self-scoped) returns the account's own
 * remaining email credits. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface SendGridUserCreditsResponse {
  remain?: number;
  total?: number;
}

export const sendgridBillingAdapter: BillingSyncAdapter = {
  platform: "sendgrid",
  label: "Twilio SendGrid",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.sendgrid.com/v3/user/credits"
    )) as SendGridUserCreditsResponse | null;

    if (typeof data?.remain !== "number" || data.remain <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `sendgrid-${day}`,
        amount: data.remain,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Twilio SendGrid — remaining email credits (credits, not currency).",
      },
    ];
  },
};
