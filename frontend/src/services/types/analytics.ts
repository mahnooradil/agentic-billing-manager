/**
 * Analytics domain types shared between the service layer and the UI.
 * These mirror the backend `/analytics/overview` response contract (Phase 9).
 */
export const ANALYTICS_RANGES = ["all", "3m", "6m", "12m", "custom"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Only meaningful when `range === "custom"` — `YYYY-MM-DD` strings straight
 *  out of an `<input type="date">`. Either edge may be omitted for an
 *  open-ended range. */
export interface CustomAnalyticsRange {
  from?: string;
  to?: string;
}

export type BillingStatus = "Pending" | "Paid" | "Overdue";

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

export interface AnalyticsOverview {
  range: AnalyticsRange;
  generatedAt: string;
  invoiceCount: number;
  primaryCurrency: string | null;
  totalsByCurrency: CurrencyTotal[];
  byPlatform: PlatformSpend[];
  byStatus: StatusBreakdown[];
  monthlyTrend: MonthlyPoint[];
  insights: AnalyticsInsight[];
}

/** Response `data` shape returned by the analytics overview endpoint. */
export interface AnalyticsOverviewData {
  analytics: AnalyticsOverview;
}

// ── Advanced analytics (F6) ──
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
  generatedAt: string;
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

/** Response `data` shape returned by the advanced analytics endpoint. */
export interface AdvancedAnalyticsData {
  analytics: AdvancedAnalytics;
}
