/**
 * Analytics engine — the shared read-only aggregation used by both the analytics
 * endpoint (Phase 9) and the AI recommendations endpoint (Phase 10).
 *
 * Extracted verbatim from the original analytics controller so the two callers
 * stay DRY and the wire output is identical. No data is mutated; all pipelines
 * are fixed and server-defined (no user-supplied field names/operators), so
 * there is no injection surface. Money is never summed across currencies — see
 * `analytics.serializer.ts` for the shaping rules.
 */
import { Types, type PipelineStage } from "mongoose";

import { Billing } from "@/models/billing.model";
import {
  toPublicAnalyticsOverview,
  type PublicAnalyticsOverview,
  type RawCurrencyRow,
  type RawStatusRow,
  type RawPlatformRow,
  type RawMonthRow,
} from "@/utils/analytics.serializer";
import { ANALYTICS_RANGE_MONTHS, type AnalyticsRange } from "@/validators/analytics.validator";

/** Max platforms shown in the "spend by platform" view. */
const TOP_PLATFORMS_LIMIT = 8;
/** Max months shown in the trend (most recent). */
const TREND_MONTHS_LIMIT = 12;

/** An explicit `from`/`to` window, used only when `range === "custom"`. */
export interface CustomRangeBounds {
  from?: Date;
  to?: Date;
}

/**
 * Builds the `billingDate` filter for a range. `all` returns an empty match so
 * every record is included; bounded ranges look back N whole months from `now`;
 * `custom` uses the caller-supplied `from`/`to` bounds directly (either edge
 * may be omitted for an open-ended range). Exported so advanced analytics
 * (F6) reuse the exact same range semantics.
 */
export function buildRangeMatch(
  range: AnalyticsRange,
  now: Date = new Date(),
  custom?: CustomRangeBounds
): Record<string, unknown> {
  if (range === "custom") {
    const billingDate: Record<string, Date> = {};
    if (custom?.from) billingDate.$gte = custom.from;
    if (custom?.to) billingDate.$lte = custom.to;
    return Object.keys(billingDate).length > 0 ? { billingDate } : {};
  }
  if (range === "all") return {};
  const months = ANALYTICS_RANGE_MONTHS[range];
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return { billingDate: { $gte: cutoff } };
}

/**
 * Computes the composite analytics overview for a range, scoped to ONE
 * organization — every pipeline below MUST start with the `organization`
 * match so data never crosses between organizations. Single source of truth
 * for the aggregation — callers just consume the returned `PublicAnalyticsOverview`.
 */
export async function computeAnalyticsOverview(
  organizationId: string,
  range: AnalyticsRange,
  custom?: CustomRangeBounds
): Promise<PublicAnalyticsOverview> {
  const now = new Date();
  const rangeMatch = {
    organization: new Types.ObjectId(organizationId),
    ...buildRangeMatch(range, now, custom),
  };

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
        // A record has exactly one of `platform` (manual) or
        // `platformConnection` (auto_sync/email_sync). Grouping by the ref
        // ALONE would merge every vendor behind one email/OAuth connection
        // (e.g. Netflix, Spotify, and GitHub all via the same Gmail inbox)
        // into a single bucket — `vendorName` (set by email-sync's AI
        // extraction) breaks those back apart; auto_sync/manual records
        // have no `vendorName`, so they group exactly as before.
        $group: {
          _id: { ref: { $ifNull: ["$platform", "$platformConnection"] }, vendor: "$vendorName" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: TOP_PLATFORMS_LIMIT },
      {
        $lookup: {
          from: "platforms",
          localField: "_id.ref",
          foreignField: "_id",
          as: "platformDoc",
        },
      },
      {
        $lookup: {
          from: "platformconnections",
          localField: "_id.ref",
          foreignField: "_id",
          as: "connectionDoc",
        },
      },
      {
        // Exactly one of these two arrays has a match (the other is
        // empty) — a manual Platform's own name/slug, or a synced
        // connection's name/slug, overridden by the specific vendor name
        // when one was captured (see the group stage's comment).
        $addFields: {
          platform: {
            $cond: [
              { $gt: [{ $size: "$platformDoc" }, 0] },
              {
                name: { $arrayElemAt: ["$platformDoc.name", 0] },
                slug: { $arrayElemAt: ["$platformDoc.slug", 0] },
              },
              {
                name: {
                  $ifNull: ["$_id.vendor", { $arrayElemAt: ["$connectionDoc.displayName", 0] }],
                },
                slug: { $arrayElemAt: ["$connectionDoc.platform", 0] },
              },
            ],
          },
        },
      },
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

  return toPublicAnalyticsOverview({
    range,
    now,
    primaryCurrency,
    totalsByCurrency,
    byStatus,
    byPlatform,
    monthlyTrend,
  });
}
