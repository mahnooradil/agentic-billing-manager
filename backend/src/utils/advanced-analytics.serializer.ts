/**
 * Advanced analytics serializer — Phase F6 (Billing Intelligence).
 *
 * Deterministic shaping of the advanced billing analytics: it reuses the Phase 9
 * overview and adds growth, recurring/largest expenses, duplicate-charge
 * detection, high-cost/underused platforms, and a rule-based insight + summary
 * layer. NO AI/provider calls — every field is a pure function of the aggregates.
 *
 * Data-model notes (documented, deterministic proxies where a first-class field
 * doesn't exist): "category" = invoice status; "recurring/largest" = same
 * (platform, amount, currency) seen across ≥2 months; "duplicate" = same
 * (platform, amount, currency) charged ≥2× in one month; "underused" = an
 * Inactive platform still being billed.
 */
import type {
  PublicAnalyticsOverview,
  CurrencyTotal,
  PlatformSpend,
  MonthlyPoint,
} from "@/utils/analytics.serializer";
import type { AnalyticsRange } from "@/validators/analytics.validator";

/** Raw aggregation rows produced by the advanced analytics service. */
export interface RawRecurringRow {
  name?: string | null;
  amount: number;
  currency: string;
  occurrences: number;
  monthCount: number;
}
export interface RawDuplicateRow {
  name?: string | null;
  amount: number;
  currency: string;
  month: string;
  count: number;
}
export interface RawUnderusedRow {
  name: string;
  slug: string;
  currency: string;
  total: number;
  count: number;
}
export interface RawStatusAmountRow {
  status: string;
  count: number;
  amount: number;
}

export interface SpendingGrowth {
  currency: string;
  currentMonth: string;
  currentTotal: number;
  previousMonth: string;
  previousTotal: number;
  changeAmount: number;
  changePercent: number | null;
}
export interface CategorySpend {
  category: string;
  count: number;
  amount: number;
  currency: string;
}
export interface RecurringExpense {
  platform: string;
  amount: number;
  currency: string;
  occurrences: number;
  months: number;
}
export interface DuplicateCharge {
  platform: string;
  amount: number;
  currency: string;
  month: string;
  count: number;
}
export interface HighCostPlatform {
  platform: string;
  currency: string;
  total: number;
  sharePercent: number;
}
export interface UnderusedSubscription {
  platform: string;
  currency: string;
  total: number;
  invoices: number;
  reason: string;
}
export interface AdvancedInsights {
  topSpending: string[];
  costSaving: string[];
  risks: string[];
}

export interface AdvancedAnalytics {
  range: AnalyticsRange;
  generatedAt: Date;
  invoiceCount: number;
  primaryCurrency: string | null;
  currencyBreakdown: CurrencyTotal[];
  platformBreakdown: PlatformSpend[];
  categoryBreakdown: CategorySpend[];
  monthlyTrend: MonthlyPoint[];
  growth: SpendingGrowth | null;
  largestExpenses: RecurringExpense[];
  duplicateSubscriptions: DuplicateCharge[];
  highCostPlatforms: HighCostPlatform[];
  underusedSubscriptions: UnderusedSubscription[];
  insights: AdvancedInsights;
  summary: string;
}

/** Share (%) of primary-currency spend that flags a platform as "high cost". */
const HIGH_COST_SHARE = 25;
/** Month-over-month growth (%) that counts as a notable rise. */
const GROWTH_ALERT = 20;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(amount: number, currency: string): string {
  return `${round2(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

interface BuildInput {
  range: AnalyticsRange;
  now: Date;
  overview: PublicAnalyticsOverview;
  recurring: RawRecurringRow[];
  duplicates: RawDuplicateRow[];
  underused: RawUnderusedRow[];
  statusAmounts: RawStatusAmountRow[];
}

/** Computes month-over-month growth from the (primary-currency) trend. */
function computeGrowth(trend: MonthlyPoint[]): SpendingGrowth | null {
  if (trend.length < 2) return null;
  const current = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  const changeAmount = round2(current.total - previous.total);
  const changePercent =
    previous.total > 0
      ? Math.round(((current.total - previous.total) / previous.total) * 100)
      : null;
  return {
    currency: current.currency,
    currentMonth: current.month,
    currentTotal: current.total,
    previousMonth: previous.month,
    previousTotal: previous.total,
    changeAmount,
    changePercent,
  };
}

/** Builds the full advanced analytics object (deterministic). */
export function toAdvancedAnalytics(input: BuildInput): AdvancedAnalytics {
  const { overview } = input;
  const primaryCurrency = overview.primaryCurrency;
  const primary = primaryCurrency
    ? overview.totalsByCurrency.find((c) => c.currency === primaryCurrency)
    : undefined;

  const categoryBreakdown: CategorySpend[] = input.statusAmounts.map((row) => ({
    category: row.status,
    count: row.count,
    amount: round2(row.amount),
    currency: primaryCurrency ?? "",
  }));

  const largestExpenses: RecurringExpense[] = input.recurring
    .map((row) => ({
      platform: row.name ?? "Unknown platform",
      amount: round2(row.amount),
      currency: row.currency,
      occurrences: row.occurrences,
      months: row.monthCount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const duplicateSubscriptions: DuplicateCharge[] = input.duplicates.map(
    (row) => ({
      platform: row.name ?? "Unknown platform",
      amount: round2(row.amount),
      currency: row.currency,
      month: row.month,
      count: row.count,
    })
  );

  // High-cost platforms: share of primary-currency spend.
  let highCostPlatforms: HighCostPlatform[] = [];
  if (primary && primary.total > 0) {
    const withShare = overview.byPlatform.map((p) => ({
      platform: p.name,
      currency: p.currency,
      total: p.total,
      sharePercent: Math.round((p.total / primary.total) * 100),
    }));
    highCostPlatforms = withShare.filter((p) => p.sharePercent >= HIGH_COST_SHARE);
    if (highCostPlatforms.length === 0) highCostPlatforms = withShare.slice(0, 3);
  }

  const underusedSubscriptions: UnderusedSubscription[] = input.underused.map(
    (row) => ({
      platform: row.name,
      currency: row.currency,
      total: round2(row.total),
      invoices: row.count,
      reason: "Inactive platform still being billed",
    })
  );

  const growth = computeGrowth(overview.monthlyTrend);

  // ── Deterministic insights ──
  const topSpending: string[] = [];
  const costSaving: string[] = [];
  const risks: string[] = [];

  if (overview.byPlatform.length > 0 && primary && primary.total > 0) {
    const top = overview.byPlatform[0];
    const share = Math.round((top.total / primary.total) * 100);
    topSpending.push(
      `${top.name} is your largest expense at ${money(top.total, top.currency)} (${share}% of ${primary.currency} spend).`
    );
  }
  if (primary) {
    topSpending.push(
      `Total ${primary.currency} spend this period: ${money(primary.total, primary.currency)} across ${primary.count} invoice${plural(primary.count)}.`
    );
  }
  if (overview.totalsByCurrency.length > 1) {
    topSpending.push(
      `Spending spans ${overview.totalsByCurrency.length} currencies; figures are shown per currency.`
    );
  }

  if (duplicateSubscriptions.length > 0) {
    costSaving.push(
      `Found ${duplicateSubscriptions.length} duplicate charge${plural(duplicateSubscriptions.length)} in a single month — review to avoid double billing.`
    );
  }
  if (underusedSubscriptions.length > 0) {
    costSaving.push(
      `${underusedSubscriptions.length} inactive platform${plural(underusedSubscriptions.length)} still being billed — consider cancelling.`
    );
  }
  if (primary && primary.outstanding > 0) {
    costSaving.push(
      `${money(primary.outstanding, primary.currency)} is outstanding across unpaid invoices — collecting it improves cash flow.`
    );
  }

  const overdue =
    overview.byStatus.find((s) => s.status === "Overdue")?.count ?? 0;
  if (overdue > 0) {
    risks.push(
      `${overdue} overdue invoice${plural(overdue)} need attention.`
    );
  }
  if (growth && growth.changePercent !== null && growth.changePercent >= GROWTH_ALERT) {
    risks.push(
      `Spending rose ${growth.changePercent}% vs last month (${money(growth.currentTotal, growth.currency)}) — watch for cost creep.`
    );
  }

  // ── Deterministic summary ──
  let summary: string;
  if (overview.invoiceCount === 0) {
    summary = "No billing data yet to analyze. Add billing records to unlock insights.";
  } else {
    const bits: string[] = [];
    bits.push(
      `You recorded ${overview.invoiceCount} invoice${plural(overview.invoiceCount)} this period` +
        (primary ? `, totalling ${money(primary.total, primary.currency)}` : "") +
        "."
    );
    if (topSpending.length > 0) bits.push(topSpending[0]);
    if (growth && growth.changePercent !== null) {
      const dir = growth.changePercent >= 0 ? "up" : "down";
      bits.push(
        `Month-over-month spend is ${dir} ${Math.abs(growth.changePercent)}%.`
      );
    }
    if (overdue > 0) bits.push(`${overdue} invoice${plural(overdue)} are overdue.`);
    if (duplicateSubscriptions.length > 0)
      bits.push(`${duplicateSubscriptions.length} possible duplicate charge${plural(duplicateSubscriptions.length)} detected.`);
    if (costSaving.length > 0) bits.push(costSaving[0]);
    summary = bits.join(" ");
  }

  return {
    range: input.range,
    generatedAt: input.now,
    invoiceCount: overview.invoiceCount,
    primaryCurrency,
    currencyBreakdown: overview.totalsByCurrency,
    platformBreakdown: overview.byPlatform,
    categoryBreakdown,
    monthlyTrend: overview.monthlyTrend,
    growth,
    largestExpenses,
    duplicateSubscriptions,
    highCostPlatforms,
    underusedSubscriptions,
    insights: { topSpending, costSaving, risks },
    summary,
  };
}
