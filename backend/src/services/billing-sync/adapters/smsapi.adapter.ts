/**
 * SMSAPI billing adapter.
 *
 * `GET /profile` (self-scoped) is expected to return the account's own
 * points balance, but the exact field name isn't confirmed against a live
 * response — this parses defensively and returns `[]` rather than
 * guessing a wrong number. Recorded with a non-currency `CRD` code (see
 * elevenlabs.adapter.ts) — always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface SmsApiProfileResponse {
  points?: number | string;
}

export const smsapiBillingAdapter: BillingSyncAdapter = {
  platform: "smsapi",
  label: "SMSAPI",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.smsapi.com/profile"
    )) as SmsApiProfileResponse | null;

    const points = Number(data?.points);
    if (!Number.isFinite(points) || points <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `smsapi-${day}`,
        amount: points,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from SMSAPI — points balance (credits, not currency).",
      },
    ];
  },
};
