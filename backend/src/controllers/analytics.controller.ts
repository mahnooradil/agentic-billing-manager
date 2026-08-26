/**
 * Analytics controller — Phase 9 (Analytics Engine foundation).
 *
 * Thin HTTP layer over the shared analytics engine. The aggregation itself lives
 * in `services/analytics/analytics.engine.ts` (extracted in Phase 10 so the AI
 * recommendations controller can reuse it) — this handler only parses the query
 * and returns the result. The route is protected by `authenticate`; async
 * rejections are forwarded via `asyncHandler`. Every result is scoped to the
 * authenticated user.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import {
  computeAnalyticsOverview,
  type CustomRangeBounds,
} from "@/services/analytics/analytics.engine";
import { computeAdvancedAnalytics } from "@/services/analytics/advanced-analytics";
import { analyticsQuerySchema } from "@/validators/analytics.validator";

/** Parses `from`/`to` into real Dates, silently dropping either side that
 *  isn't a valid date rather than erroring — a custom range with one or both
 *  edges missing/invalid degrades to an open-ended range, never a 400, since
 *  this is a read-only dashboard query. */
function parseCustomBounds(from?: string, to?: string): CustomRangeBounds {
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  return {
    from: fromDate && !isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !isNaN(toDate.getTime()) ? toDate : undefined,
  };
}

/** GET /api/analytics/overview — composite analytics for the dashboard. */
export const getAnalyticsOverview = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  // Read-only query param; unknown values are clamped to "all" by the schema.
  const { range, from, to } = analyticsQuerySchema.parse(req.query);
  const custom = range === "custom" ? parseCustomBounds(from, to) : undefined;
  const analytics = await computeAnalyticsOverview(organization._id.toString(), range, custom);

  sendSuccess(res, 200, "Analytics overview retrieved", { analytics });
});

/** GET /api/analytics/advanced — deep billing intelligence (F6). */
export const getAdvancedAnalytics = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const { range, from, to } = analyticsQuerySchema.parse(req.query);
  const custom = range === "custom" ? parseCustomBounds(from, to) : undefined;
  const analytics = await computeAdvancedAnalytics(organization._id.toString(), range, custom);

  sendSuccess(res, 200, "Advanced analytics retrieved", { analytics });
});
