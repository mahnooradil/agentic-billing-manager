/**
 * Dashboard statistics controllers.
 *
 * Read-only aggregate counts for the overview screen. All routes are protected
 * by `authenticate`, so these handlers focus on the query; async rejections are
 * forwarded via `asyncHandler`. Stats are computed directly from the existing
 * Platform collection — no new model is introduced (out of scope for this phase).
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { sendSuccess } from "@/utils/apiResponse";
import { Platform } from "@/models/platform.model";

/** GET /api/dashboard/stats — platform counts for the overview cards. */
export const getDashboardStats = asyncHandler(async (_req, res) => {
  const [totalPlatforms, activePlatforms, inactivePlatforms] = await Promise.all([
    Platform.countDocuments(),
    Platform.countDocuments({ status: "Active" }),
    Platform.countDocuments({ status: "Inactive" }),
  ]);

  sendSuccess(res, 200, "Dashboard statistics retrieved", {
    stats: { totalPlatforms, activePlatforms, inactivePlatforms },
  });
});
