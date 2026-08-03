/**
 * GitHub billing adapter.
 *
 * Two calls: `GET /user` to discover the connected account's own login, then
 * `GET /users/{login}/settings/billing/usage` for the current month's billed
 * usage items (Actions, Packages, Copilot, etc.). Free-tier accounts have no
 * billing data and this simply syncs nothing — never an error. Line items
 * are summed into one monthly total, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface GitHubUserResponse {
  login?: string;
}

interface GitHubUsageResponse {
  usageItems?: { netAmount?: number }[];
}

export const githubBillingAdapter: BillingSyncAdapter = {
  platform: "github",
  label: "GitHub",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const user = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.github.com/user"
    )) as GitHubUserResponse | null;

    const login = user?.login;
    if (!login) return [];

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const usage = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.github.com/users/${encodeURIComponent(login)}/settings/billing/usage?year=${year}&month=${month}`
    )) as GitHubUsageResponse | null;

    const items = usage?.usageItems ?? [];
    const totalCost = items.reduce((sum, item) => sum + (item.netAmount ?? 0), 0);
    if (totalCost <= 0) return [];

    const period = `${year}-${String(month).padStart(2, "0")}`;

    return [
      {
        externalId: `github-${period}`,
        amount: totalCost,
        currency: "USD",
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from GitHub — billed usage for the current month.",
      },
    ];
  },
};
