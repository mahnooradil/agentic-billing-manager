/**
 * Deepgram billing adapter.
 *
 * Two calls: `GET /v1/projects` (self-scoped, no id needed) to discover the
 * connected account's own project, then `GET /v1/projects/{id}/balances`
 * for that project's outstanding balance(s). One record per balance,
 * upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface DeepgramProjectsResponse {
  projects?: { project_id?: string }[];
}

interface DeepgramBalance {
  balance_id?: string;
  amount?: number;
  units?: string;
}

interface DeepgramBalancesResponse {
  balances?: DeepgramBalance[];
}

export const deepgramBillingAdapter: BillingSyncAdapter = {
  platform: "deepgram",
  label: "Deepgram",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const projects = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.deepgram.com/v1/projects"
    )) as DeepgramProjectsResponse | null;

    const projectId = projects?.projects?.[0]?.project_id;
    if (!projectId) return [];

    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.deepgram.com/v1/projects/${projectId}/balances`
    )) as DeepgramBalancesResponse | null;

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    return (data?.balances ?? [])
      .filter((b) => typeof b.amount === "number")
      .map((b) => ({
        externalId: `deepgram-${b.balance_id ?? period}`,
        amount: b.amount as number,
        currency: (b.units || "usd").toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: "Auto-synced from Deepgram — outstanding project balance.",
      }));
  },
};
