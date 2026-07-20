/**
 * Analytics controller — Phase 9 (Analytics Engine foundation).
 *
 * Read-only aggregations over the existing Billing collection. No new model is
 * introduced and no data is mutated. All figures are derived at request time
 * with fixed, server-defined aggregation pipelines (no user-supplied field
 * names/operators), so there is no injection surface. The route is protected by
 * `authenticate`; async rejections are forwarded via `asyncHandler`.
 *
 * Money is never summed across currencies: per-currency totals are authoritative
 * and the comparative views (by platform, monthly trend) are computed in a single
 * `primaryCurrency` (the currency with the highest total).
 */
import type { PipelineStage } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { sendSuccess } from "@/utils/apiResponse";
import { Billing } from "@/models/billing.model";
import {
  toPublicAnalyticsOverview,
  type RawCurrencyRow,
  type RawStatusRow,
  type RawPlatformRow,
  type RawMonthRow,
} from "@/utils/analytics.serializer";
import {
  analyticsQuerySchema,
  ANALYTICS_RANGE_MONTHS,
  type AnalyticsRange,
} from "@/validators/analytics.validator";

/** Max platforms shown in the "spend by platform" view. */
const TOP_PLATFORMS_LIMIT = 8;
/** Max months shown in the trend (most recent). */
const TREND_MONTHS_LIMIT = 12;

/**
 * Builds the `billingDate` filter for a range. `all` returns an empty match so
 * every record is included; bounded ranges look back N whole months from `now`.
 */
function buildRangeMatch(
  range: AnalyticsRange,
  now: Date
): Record<string, unknown> {
  if (range === "all") return {};
  const months = ANALYTICS_RANGE_MONTHS[range];
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return { billingDate: { $gte: cutoff } };
}

/** GET /api/analytics/overview — composite analytics for the dashboard. */
export const getAnalyticsOverview = asyncHandler(async (req, res) => {
  // Read-only query param; unknown values are clamped to "all" by the schema.
  const { range } = analyticsQuerySchema.parse(req.query);
  const now = new Date();
  const rangeMatch = buildRangeMatch(range, now);

  // Currency- and status-level aggregates do not depend on the primary currency,
  // so they run together first.
  const [totalsByCurrency, byStatus] = await Promise.all([
    Billing.aggregate<RawCurrencyRow>([
      { $match: rangeMatch },
      {
        $group: {
          _id: "$currency",
          total: { $sum: "$amount" },
          paid: {
            $sum: {
              $cond: [{ $eq: ["$status", "Paid"] }, "$amount", 0],
            },
          },
          outstanding: {
            $sum: {
              $cond: [
                { $in: ["$status", ["Pending", "Overdue"]] },
                "$amount",
                0,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),
    Billing.aggregate<RawStatusRow>([
      { $match: rangeMatch },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  // The primary currency drives the comparative views (highest total wins).
  const primaryCurrency = totalsByCurrency[0]?._id ?? null;

  let byPlatform: RawPlatformRow[] = [];
  let monthlyTrend: RawMonthRow[] = [];

  if (primaryCurrency) {
    const currencyMatch = { ...rangeMatch, currency: primaryCurrency };

    const platformPipeline: PipelineStage[] = [
      { $match: currencyMatch },
      {
        $group: { _id: "$platform", total: { $sum: "$amount" }, count: { $sum: 1 } },
      },
      { $sort: { total: -1 } },
      { $limit: TOP_PLATFORMS_LIMIT },
      {
        $lookup: {
          from: "platforms",
          localField: "_id",
          foreignField: "_id",
          as: "platform",
        },
      },
      { $unwind: { path: "$platform", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          total: 1,
          count: 1,
          "platform.name": 1,
          "platform.slug": 1,
        },
      },
    ];

    // Group by "YYYY-MM", keep the most recent TREND_MONTHS_LIMIT, then present
    // oldest-to-newest for a natural left-to-right trend.
    const trendPipeline: PipelineStage[] = [
      { $match: currencyMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$billingDate" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: TREND_MONTHS_LIMIT },
      { $sort: { _id: 1 } },
    ];

    [byPlatform, monthlyTrend] = await Promise.all([
      Billing.aggregate<RawPlatformRow>(platformPipeline),
      Billing.aggregate<RawMonthRow>(trendPipeline),
    ]);
  }

  const analytics = toPublicAnalyticsOverview({
    range,
    now,
    primaryCurrency,
    totalsByCurrency,
    byStatus,
    byPlatform,
    monthlyTrend,
  });

  sendSuccess(res, 200, "Analytics overview retrieved", { analytics });
});
