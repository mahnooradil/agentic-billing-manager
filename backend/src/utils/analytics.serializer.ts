/**
 * Analytics overview serializer — Phase 9 (Analytics Engine foundation).
 *
 * Single source of truth for the shape of `GET /api/analytics/overview`. Takes
 * the raw aggregation rows produced by the controller and returns the rounded,
 * normalized wire object, including a small set of deterministic, rule-based
 * insights (NO AI/LLM call — pure functions over the aggregated numbers).
 *
 * Money note: amounts in different currencies are never summed together. The
 * per-currency totals are authoritative; the comparative views (by platform,
 * monthly trend) are expressed in a single `primaryCurrency` and labelled as
 * such, so nothing silently mixes currencies.
 */
import { BILLING_STATUSES, type BillingStatus } from "@/models/billing.model";
import type { AnalyticsRange } from "@/validators/analytics.validator";

/** Raw `$group` row: one currency with its summed amounts. */
export interface RawCurrencyRow {
  _id: string; // currency code
  total: number;
  paid: number;
  outstanding: number;
  count: number;
}

/** Raw `$group` row: one status with its record count. */
export interface RawStatusRow {
  _id: BillingStatus;
  count: number;
}

/** Raw `$group` + `$lookup` row: spend for one platform (primary currency). */
export interface RawPlatformRow {
  _id: unknown; // platform ObjectId
  total: number;
  count: number;
  platform?: { name?: string; slug?: string } | null;
}

/** Raw `$group` row: spend for one `YYYY-MM` month (primary currency). */
export interface RawMonthRow {
  _id: string; // "YYYY-MM"
  total: number;
  count: number;
}

export interface CurrencyTotal {
  currency: string;
  total: number;
  paid: number;
  outstanding: number;
  average: number;
  count: number;
}

export interface PlatformSpend {
  platformId: string;
  name: string;
  slug: string;
  currency: string;
  total: number;
  count: number;
}

export interface StatusBreakdown {
  status: BillingStatus;
  count: number;
}

export interface MonthlyPoint {
  month: string; // "YYYY-MM"
  currency: string;
  total: number;
  count: number;
}

export interface AnalyticsInsight {
  id: string;
  severity: "info" | "success" | "warning";
  message: string;
}

export interface PublicAnalyticsOverview {
  range: AnalyticsRange;
  generatedAt: Date;
  invoiceCount: number;
  primaryCurrency: string | null;
  totalsByCurrency: CurrencyTotal[];
  byPlatform: PlatformSpend[];
  byStatus: StatusBreakdown[];
  monthlyTrend: MonthlyPoint[];
  insights: AnalyticsInsight[];
}

/** Rounds a monetary value to 2 decimals, guarding against float artefacts. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

interface BuildInput {
  range: AnalyticsRange;
  now: Date;
  primaryCurrency: string | null;
  totalsByCurrency: RawCurrencyRow[];
  byStatus: RawStatusRow[];
  byPlatform: RawPlatformRow[];
  monthlyTrend: RawMonthRow[];
}

/** Builds the public analytics overview from raw aggregation output. */
export function toPublicAnalyticsOverview(
  input: BuildInput
): PublicAnalyticsOverview {
  const totalsByCurrency: CurrencyTotal[] = input.totalsByCurrency.map(
    (row) => ({
      currency: row._id,
      total: round2(row.total),
      paid: round2(row.paid),
      outstanding: round2(row.outstanding),
      average: row.count > 0 ? round2(row.total / row.count) : 0,
      count: row.count,
    })
  );

  const invoiceCount = totalsByCurrency.reduce((sum, c) => sum + c.count, 0);

  // Normalize the status breakdown so every status is always present (stable UI).
  const statusCounts = new Map(input.byStatus.map((r) => [r._id, r.count]));
  const byStatus: StatusBreakdown[] = BILLING_STATUSES.map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0,
  }));

  const primaryCurrency = input.primaryCurrency;

  const byPlatform: PlatformSpend[] = input.byPlatform.map((row) => ({
    platformId: row._id ? String(row._id) : "",
    name: row.platform?.name ?? "Unknown platform",
    slug: row.platform?.slug ?? "",
    currency: primaryCurrency ?? "",
    total: round2(row.total),
    count: row.count,
  }));

  const monthlyTrend: MonthlyPoint[] = input.monthlyTrend.map((row) => ({
    month: row._id,
    currency: primaryCurrency ?? "",
    total: round2(row.total),
    count: row.count,
  }));

  const insights = generateInsights({
    invoiceCount,
    primaryCurrency,
    totalsByCurrency,
    byStatus,
    byPlatform,
  });

  return {
    range: input.range,
    generatedAt: input.now,
    invoiceCount,
    primaryCurrency,
    totalsByCurrency,
    byPlatform,
    byStatus,
    monthlyTrend,
    insights,
  };
}

/** Formats an amount + currency for insight copy (best-effort, ASCII-safe). */
function money(amount: number, currency: string): string {
  return `${round2(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

interface InsightInput {
  invoiceCount: number;
  primaryCurrency: string | null;
  totalsByCurrency: CurrencyTotal[];
  byStatus: StatusBreakdown[];
  byPlatform: PlatformSpend[];
}

/**
 * Deterministic, rule-based insights derived purely from the aggregates. These
 * are the seeds the future AI agent will build on, but here they involve NO
 * model call — just thresholds over the numbers, so they are fast and testable.
 */
function generateInsights(input: InsightInput): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  if (input.invoiceCount === 0) {
    return insights;
  }

  const overdue = input.byStatus.find((s) => s.status === "Overdue")?.count ?? 0;
  const pending = input.byStatus.find((s) => s.status === "Pending")?.count ?? 0;
  const primary = input.primaryCurrency
    ? input.totalsByCurrency.find((c) => c.currency === input.primaryCurrency)
    : undefined;

  if (overdue > 0) {
    insights.push({
      id: "overdue-invoices",
      severity: "warning",
      message: `You have ${overdue} overdue invoice${
        overdue === 1 ? "" : "s"
      } that need attention.`,
    });
  }

  if (primary && primary.outstanding > 0) {
    insights.push({
      id: "outstanding-amount",
      severity: overdue > 0 ? "warning" : "info",
      message: `${money(
        primary.outstanding,
        primary.currency
      )} is outstanding across unpaid invoices.`,
    });
  }

  // Concentration: does one platform dominate primary-currency spend?
  if (primary && primary.total > 0 && input.byPlatform.length > 0) {
    const top = input.byPlatform[0];
    const share = Math.round((top.total / primary.total) * 100);
    if (share >= 40) {
      insights.push({
        id: "spend-concentration",
        severity: "info",
        message: `${top.name} accounts for ${share}% of your ${primary.currency} spend.`,
      });
    }
  }

  // All settled.
  if (overdue === 0 && pending === 0) {
    insights.push({
      id: "all-paid",
      severity: "success",
      message: "All invoices in this period are paid. Nothing outstanding.",
    });
  }

  if (input.totalsByCurrency.length > 1) {
    insights.push({
      id: "multi-currency",
      severity: "info",
      message: `Billing spans ${input.totalsByCurrency.length} currencies; totals are shown per currency.`,
    });
  }

  return insights;
}
