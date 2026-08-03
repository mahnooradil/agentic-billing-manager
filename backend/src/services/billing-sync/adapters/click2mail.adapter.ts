/**
 * Click2Mail billing adapter.
 *
 * `GET /molpro/credit` is expected to return the account's own mailing
 * credit balance, but the response format isn't confirmed against a live
 * response (this legacy endpoint may not return JSON, in which case this
 * safely parses to nothing) — this parses defensively and returns `[]`
 * rather than guessing a wrong number. Recorded with a non-currency `CRD`
 * code (see elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface Click2MailCreditResponse {
  credit?: number | string;
  balance?: number | string;
}

export const click2mailBillingAdapter: BillingSyncAdapter = {
  platform: "click2mail2",
  label: "Click2Mail",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://www.click2mail.com/molpro/credit"
    )) as Click2MailCreditResponse | null;

    const amount = Number(data?.credit ?? data?.balance);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `click2mail2-${day}`,
        amount,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from Click2Mail — mailing credit balance (credits, not currency).",
      },
    ];
  },
};
