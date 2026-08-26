/**
 * Analytics summary tool — Phase 11, enriched 2026-08-20 with a top-customers
 * breakdown (per the user's explicit request that the Billing Advisor Agent
 * be able to answer specific questions like "which customer has the most
 * invoices" or "who do I bill the most"). This is the user's OWN business
 * data about their OWN customers — not a third party's private data — so
 * including customer names here (unlike the rest of this summary, which
 * stays aggregate-only) is an intentional, requested trade-off, not an
 * oversight.
 */
import { Types } from "mongoose";

import { Billing } from "@/models/billing.model";
import { computeAnalyticsOverview } from "@/services/analytics/analytics.engine";
import { getOrganizationIdForUser } from "@/services/organizations/membership-lookup.service";
import type { AssistantTool } from "@/services/ai/tools/types";

const TOP_CUSTOMERS_LIMIT = 5;

export interface TopCustomerByCount {
  customerName: string;
  invoiceCount: number;
}

export interface TopCustomerByAmount {
  customerName: string;
  totalAmount: number;
  currency: string;
}

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
  /** Top customers by invoice COUNT, across all currencies (currency-agnostic). */
  topCustomersByInvoiceCount: TopCustomerByCount[];
  /** Top customers by total amount, within the primary currency only (amounts
   *  across different currencies are never summed together). */
  topCustomersByAmount: TopCustomerByAmount[];
}

interface CustomerCountRow {
  _id: string;
  count: number;
}
interface CustomerAmountRow {
  _id: string;
  total: number;
}

async function computeTopCustomers(
  organizationId: string,
  primaryCurrency: string | null
): Promise<{ byCount: TopCustomerByCount[]; byAmount: TopCustomerByAmount[] }> {
  const orgMatch = { organization: new Types.ObjectId(organizationId) };

  const byCountRows = await Billing.aggregate<CustomerCountRow>([
    { $match: orgMatch },
    { $group: { _id: "$customerName", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: TOP_CUSTOMERS_LIMIT },
  ]);

  const byAmountRows = primaryCurrency
    ? await Billing.aggregate<CustomerAmountRow>([
        { $match: { ...orgMatch, currency: primaryCurrency } },
        { $group: { _id: "$customerName", total: { $sum: "$amount" } } },
        { $sort: { total: -1 } },
        { $limit: TOP_CUSTOMERS_LIMIT },
      ])
    : [];

  return {
    byCount: byCountRows.map((r) => ({ customerName: r._id, invoiceCount: r.count })),
    byAmount: byAmountRows.map((r) => ({
      customerName: r._id,
      totalAmount: r.total,
      currency: primaryCurrency as string,
    })),
  };
}

/** Parses a tool-call `from`/`to` string into a Date, undefined on anything
 *  invalid or absent — never guessed, matching the rest of this app's date
 *  handling (see sync-engine.ts's `parseAiDate`). */
function parseToolDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

/** Builds a compact analytics summary, plus a top-customers breakdown (see
 *  file docstring on why customer names appear here specifically). Defaults
 *  to all-time; pass `input.from`/`input.to` (YYYY-MM-DD) for a specific
 *  window instead — either edge may be omitted for an open-ended range. */
async function runAnalyticsSummary(
  userId: string,
  input?: Record<string, unknown>
): Promise<AnalyticsSummary> {
  const organizationId = await getOrganizationIdForUser(userId);
  if (!organizationId) {
    return {
      invoiceCount: 0,
      primaryCurrency: null,
      totalsByCurrency: [],
      statusCounts: [],
      spendByPlatform: [],
      recentMonthlyTrend: [],
      ruleBasedInsights: [],
      topCustomersByInvoiceCount: [],
      topCustomersByAmount: [],
    };
  }

  const from = parseToolDate(input?.from);
  const to = parseToolDate(input?.to);
  const organizationIdStr = organizationId.toString();
  const overview = await computeAnalyticsOverview(
    organizationIdStr,
    from || to ? "custom" : "all",
    from || to ? { from, to } : undefined
  );
  const topCustomers = await computeTopCustomers(organizationIdStr, overview.primaryCurrency);
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
    topCustomersByInvoiceCount: topCustomers.byCount,
    topCustomersByAmount: topCustomers.byAmount,
  };
}

export const analyticsSummaryTool: AssistantTool<AnalyticsSummary> = {
  name: "get_analytics_summary",
  description:
    "Billing analytics for a time window: per-currency totals (total/paid/outstanding), invoice status counts, spend by platform, recent monthly trend, rule-based insights, and top customers by invoice count and by amount — use this for 'which customer has the most invoices/spend' style questions. Defaults to all-time; pass from/to for a specific window (e.g. 'last month', 'this quarter').",
  run: runAnalyticsSummary,
};
