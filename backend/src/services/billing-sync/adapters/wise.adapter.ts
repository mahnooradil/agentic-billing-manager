/**
 * Wise billing adapter.
 *
 * Two calls: `GET /v2/profiles` (self-scoped, no id needed) to discover the
 * connected account's own profile, then `GET /v4/profiles/{id}/balances` for
 * that profile's balance accounts. One record per non-zero balance,
 * upserted by `externalId` — a re-sync UPDATES each currency's snapshot
 * rather than duplicating it.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface WiseProfile {
  id?: number;
}

interface WiseBalance {
  currency?: string;
  amount?: { value?: number };
}

export const wiseBillingAdapter: BillingSyncAdapter = {
  platform: "wise",
  label: "Wise",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const profiles = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.wise.com/v2/profiles"
    )) as WiseProfile[] | null;

    const profileId = profiles?.[0]?.id;
    if (!profileId) return [];

    const balances = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.wise.com/v4/profiles/${profileId}/balances?types=STANDARD`
    )) as WiseBalance[] | null;

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return (balances ?? [])
      .filter((b) => typeof b.amount?.value === "number" && b.currency)
      .map((b) => ({
        externalId: `wise-${period}-${b.currency}`,
        amount: b.amount?.value as number,
        currency: (b.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: `Auto-synced from Wise — ${b.currency} balance.`,
      }));
  },
};
