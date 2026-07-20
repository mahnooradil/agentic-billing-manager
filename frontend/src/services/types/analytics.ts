/**
 * Analytics domain types shared between the service layer and the UI.
 * These mirror the backend `/analytics/overview` response contract (Phase 9).
 */
export const ANALYTICS_RANGES = ["all", "3m", "6m", "12m"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

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
