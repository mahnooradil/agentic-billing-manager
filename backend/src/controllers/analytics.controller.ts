/**
 * Analytics controller — Phase 9 (Analytics Engine foundation).
 *
 * Thin HTTP layer over the shared analytics engine. The aggregation itself lives
 * in `services/analytics/analytics.engine.ts` (extracted in Phase 10 so the AI
 * recommendations controller can reuse it) — this handler only parses the query
 * and returns the result. The route is protected by `authenticate`; async
 * rejections are forwarded via `asyncHandler`.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { sendSuccess } from "@/utils/apiResponse";
import { computeAnalyticsOverview } from "@/services/analytics/analytics.engine";
import { analyticsQuerySchema } from "@/validators/analytics.validator";

/** GET /api/analytics/overview — composite analytics for the dashboard. */
export const getAnalyticsOverview = asyncHandler(async (req, res) => {
  // Read-only query param; unknown values are clamped to "all" by the schema.
  const { range } = analyticsQuerySchema.parse(req.query);
  const analytics = await computeAnalyticsOverview(range);

  sendSuccess(res, 200, "Analytics overview retrieved", { analytics });
});
