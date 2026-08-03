/**
 * EODHD APIs billing adapter.
 *
 * `GET /api/user` (self-scoped) returns the account's own daily request
 * usage vs. limit; remaining is derived (limit - used). Recorded with a
 * non-currency `CRD` code (see elevenlabs.adapter.ts) — always synced as
 * Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface EodhdUserResponse {
  apiRequests?: number;
  dailyRateLimit?: number;
}

export const eodhdBillingAdapter: BillingSyncAdapter = {
  platform: "eodhd_apis",
  label: "EODHD APIs",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://eodhd.com/api/user"
    )) as EodhdUserResponse | null;

    const limit = data?.dailyRateLimit;
    const used = data?.apiRequests;
    if (typeof limit !== "number" || typeof used !== "number") return [];

    const remaining = limit - used;
    if (remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `eodhd_apis-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from EODHD APIs — remaining daily requests (credits, not currency).",
      },
    ];
  },
};
