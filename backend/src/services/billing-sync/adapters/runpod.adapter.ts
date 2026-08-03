/**
 * RunPod billing adapter.
 *
 * `GET /billing/pods` (self-scoped) returns billing records for the
 * account's pods. The exact response shape wasn't confirmed against a live
 * account at build time (only the endpoint's existence, via RunPod's public
 * OpenAPI spec), so this parses defensively across a few plausible field
 * names and safely syncs nothing if none match — never guesses a number.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface RunPodBillingRecord {
  id?: string;
  cost?: number;
  totalCost?: number;
  amount?: number;
  currency?: string;
  date?: string;
  createdAt?: string;
}

type RunPodBillingResponse = RunPodBillingRecord[] | { items?: RunPodBillingRecord[] };

function extractRecords(data: RunPodBillingResponse | null): RunPodBillingRecord[] {
  if (!data) return [];
  return Array.isArray(data) ? data : (data.items ?? []);
}

export const runpodBillingAdapter: BillingSyncAdapter = {
  platform: "runpod",
  label: "RunPod",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://rest.runpod.io/v1/billing/pods"
    )) as RunPodBillingResponse | null;

    return extractRecords(data)
      .map((r) => ({ ...r, amount: r.cost ?? r.totalCost ?? r.amount }))
      .filter((r): r is RunPodBillingRecord & { amount: number; id: string } =>
        Boolean(r.id) && typeof r.amount === "number"
      )
      .map((r) => ({
        externalId: `runpod-${r.id}`,
        amount: r.amount,
        currency: r.currency?.toUpperCase() || "USD",
        billingDate: new Date(r.date ?? r.createdAt ?? Date.now()),
        status: "Pending" as const,
        notes: "Auto-synced from RunPod — pod billing record.",
      }));
  },
};
