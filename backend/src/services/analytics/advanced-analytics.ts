/**
 * Advanced analytics service — Phase F6 (Billing Intelligence).
 *
 * Read-only, deterministic. Reuses the Phase 9 `computeAnalyticsOverview` for the
 * base figures (no duplicated logic) and adds fixed aggregation pipelines for
 * recurring/largest expenses, duplicate-charge detection, per-status amounts, and
 * underused (Inactive-but-billed) platforms. No AI/provider calls, no mutation,
 * no user-supplied operators — no injection surface.
 */
import { Types, type PipelineStage } from "mongoose";

import { Billing } from "@/models/billing.model";
import { Platform } from "@/models/platform.model";
import {
  computeAnalyticsOverview,
  buildRangeMatch,
  type CustomRangeBounds,
} from "@/services/analytics/analytics.engine";
import {
  toAdvancedAnalytics,
  type AdvancedAnalytics,
  type RawRecurringRow,
  type RawDuplicateRow,
  type RawUnderusedRow,
  type RawStatusAmountRow,
} from "@/utils/advanced-analytics.serializer";
import type { AnalyticsRange } from "@/validators/analytics.validator";

const RECURRING_LIMIT = 20;
const DUPLICATE_LIMIT = 20;

/** Computes the full advanced billing intelligence for a range, scoped to ONE organization. */
export async function computeAdvancedAnalytics(
  organizationId: string,
  range: AnalyticsRange,
  custom?: CustomRangeBounds
): Promise<AdvancedAnalytics> {
  const now = new Date();
  const rangeMatch = {
    organization: new Types.ObjectId(organizationId),
    ...buildRangeMatch(range, now, custom),
  };

  const overview = await computeAnalyticsOverview(organizationId, range, custom);
  const primaryCurrency = overview.primaryCurrency;

  // Recurring: same (platform, amount, currency) seen across ≥2 distinct months.
  const recurringPipeline: PipelineStage[] = [
    { $match: rangeMatch },
    {
      $group: {
        _id: { platform: "$platform", amount: "$amount", currency: "$currency" },
        occurrences: { $sum: 1 },
        months: {
          $addToSet: {
            $dateToString: { format: "%Y-%m", date: "$billingDate" },
          },
        },
      },
    },
    { $addFields: { monthCount: { $size: "$months" } } },
    { $match: { monthCount: { $gte: 2 } } },
    { $sort: { "_id.amount": -1 } },
    { $limit: RECURRING_LIMIT },
    {
      $lookup: {
        from: "platforms",
        localField: "_id.platform",
        foreignField: "_id",
        as: "platform",
      },
    },
    { $unwind: { path: "$platform", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        name: "$platform.name",
        amount: "$_id.amount",
        currency: "$_id.currency",
        occurrences: 1,
        monthCount: 1,
      },
    },
  ];

  // Duplicates: same (platform, amount, currency) charged ≥2× in one month.
  const duplicatePipeline: PipelineStage[] = [
    { $match: rangeMatch },
    {
      $group: {
        _id: {
          platform: "$platform",
          amount: "$amount",
          currency: "$currency",
          month: { $dateToString: { format: "%Y-%m", date: "$billingDate" } },
        },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gte: 2 } } },
    { $sort: { count: -1 } },
    { $limit: DUPLICATE_LIMIT },
    {
      $lookup: {
        from: "platforms",
        localField: "_id.platform",
        foreignField: "_id",
        as: "platform",
      },
    },
    { $unwind: { path: "$platform", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        name: "$platform.name",
        amount: "$_id.amount",
        currency: "$_id.currency",
        month: "$_id.month",
        count: 1,
      },
    },
  ];

  // Per-status amounts in the primary currency (the "category" breakdown).
  const statusAmountPipeline: PipelineStage[] = primaryCurrency
    ? [
        { $match: { ...rangeMatch, currency: primaryCurrency } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
        { $project: { _id: 0, status: "$_id", count: 1, amount: 1 } },
        { $sort: { amount: -1 } },
      ]
    : [];

  const [recurring, duplicates, statusAmounts] = await Promise.all([
    Billing.aggregate<RawRecurringRow>(recurringPipeline),
    Billing.aggregate<RawDuplicateRow>(duplicatePipeline),
    primaryCurrency
      ? Billing.aggregate<RawStatusAmountRow>(statusAmountPipeline)
      : Promise.resolve<RawStatusAmountRow[]>([]),
  ]);

  // Underused: Inactive platforms that still have billing records in range.
  const inactive = await Platform.find({
    organization: new Types.ObjectId(organizationId),
    status: "Inactive",
  }).select("name slug");
  const underused: RawUnderusedRow[] = [];
  for (const platform of inactive) {
    const rows = await Billing.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { ...rangeMatch, platform: platform._id } },
      { $group: { _id: "$currency", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 1 },
    ]);
    if (rows.length > 0) {
      underused.push({
        name: platform.name,
        slug: platform.slug,
        currency: rows[0]._id,
        total: rows[0].total,
        count: rows[0].count,
      });
    }
  }

  return toAdvancedAnalytics({
    range,
    now,
    overview,
    recurring,
    duplicates,
    underused,
    statusAmounts,
  });
}
