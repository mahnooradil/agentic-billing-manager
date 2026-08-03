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
import { computeAnalyticsOverview } from "@/services/analytics/analytics.engine";
import { computeAdvancedAnalytics } from "@/services/analytics/advanced-analytics";
import { analyticsQuerySchema } from "@/validators/analytics.validator";

/** GET /api/analytics/overview — composite analytics for the dashboard. */
export const getAnalyticsOverview = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  // Read-only query param; unknown values are clamped to "all" by the schema.
  const { range } = analyticsQuerySchema.parse(req.query);
  const analytics = await computeAnalyticsOverview(user._id.toString(), range);

  sendSuccess(res, 200, "Analytics overview retrieved", { analytics });
});

/** GET /api/analytics/advanced — deep billing intelligence (F6). */
export const getAdvancedAnalytics = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const { range } = analyticsQuerySchema.parse(req.query);
  const analytics = await computeAdvancedAnalytics(user._id.toString(), range);

  sendSuccess(res, 200, "Advanced analytics retrieved", { analytics });
});
