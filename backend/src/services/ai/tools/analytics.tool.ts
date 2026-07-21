/**
 * Analytics summary tool — Phase 11.
 *
 * Wraps the existing analytics engine (`computeAnalyticsOverview`) as a read-only
 * agent tool that returns a compact, PII-free billing summary. No customer names,
 * invoice numbers, notes, or raw records are ever included.
 */
import { computeAnalyticsOverview } from "@/services/analytics/analytics.engine";
import type { AssistantTool } from "@/services/ai/tools/types";

export interface AnalyticsSummary {
  invoiceCount: number;
  primaryCurrency: string | null;
  totalsByCurrency: {
    currency: string;
    total: number;
    paid: number;
    outstanding: number;
    count: number;
  }[];
  statusCounts: { status: string; count: number }[];
  spendByPlatform: {
    platform: string;
    currency: string;
    total: number;
    invoices: number;
  }[];
  recentMonthlyTrend: { month: string; currency: string; total: number }[];
  ruleBasedInsights: string[];
}

/** Builds a compact, PII-free analytics summary from all-time aggregates. */
async function runAnalyticsSummary(): Promise<AnalyticsSummary> {
  const overview = await computeAnalyticsOverview("all");
  return {
    invoiceCount: overview.invoiceCount,
    primaryCurrency: overview.primaryCurrency,
    totalsByCurrency: overview.totalsByCurrency.map((c) => ({
      currency: c.currency,
      total: c.total,
      paid: c.paid,
      outstanding: c.outstanding,
      count: c.count,
    })),
    statusCounts: overview.byStatus.map((s) => ({
      status: s.status,
      count: s.count,
    })),
    spendByPlatform: overview.byPlatform.map((p) => ({
      platform: p.name,
      currency: p.currency,
      total: p.total,
      invoices: p.count,
    })),
    // Keep the trend short to bound tokens.
    recentMonthlyTrend: overview.monthlyTrend.slice(-6).map((m) => ({
      month: m.month,
      currency: m.currency,
      total: m.total,
    })),
    ruleBasedInsights: overview.insights.map((i) => i.message),
  };
}

export const analyticsSummaryTool: AssistantTool<AnalyticsSummary> = {
  name: "get_analytics_summary",
  description:
    "Aggregated all-time billing analytics: per-currency totals (total/paid/outstanding), invoice status counts, spend by platform, recent monthly trend, and rule-based insights.",
  run: runAnalyticsSummary,
};
