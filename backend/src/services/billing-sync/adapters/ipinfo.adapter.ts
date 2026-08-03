/**
 * IPinfo.io billing adapter.
 *
 * `GET /me` (self-scoped) is expected to return the account's own request
 * usage vs. limit; remaining is derived (limit - used). The exact field
 * shape isn't confirmed against a live response, so this parses
 * defensively and returns `[]` rather than guessing a wrong number.
 * Recorded with a non-currency `CRD` code (see elevenlabs.adapter.ts) —
 * always synced as Pending.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface IpinfoRequestsInfo {
  used?: number;
  remaining?: number;
  limit?: number;
}

interface IpinfoMeResponse {
  requests?: IpinfoRequestsInfo;
}

export const ipinfoBillingAdapter: BillingSyncAdapter = {
  platform: "ipinfo_io",
  label: "IPinfo.io",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://ipinfo.io/me"
    )) as IpinfoMeResponse | null;

    const requests = data?.requests;
    const remaining =
      requests?.remaining ??
      (typeof requests?.limit === "number" && typeof requests?.used === "number"
        ? requests.limit - requests.used
        : undefined);

    if (typeof remaining !== "number" || remaining < 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `ipinfo_io-${day}`,
        amount: remaining,
        currency: "CRD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from IPinfo.io — remaining request quota (credits, not currency).",
      },
    ];
  },
};
