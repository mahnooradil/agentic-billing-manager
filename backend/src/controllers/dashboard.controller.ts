/**
 * Dashboard statistics controllers.
 *
 * Read-only aggregate counts for the overview screen, scoped to the
 * authenticated user. All routes are protected by `authenticate`; async
 * rejections are forwarded via `asyncHandler`. Stats are computed directly
 * from the existing Platform collection — no new model is introduced.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { Platform } from "@/models/platform.model";

/** GET /api/dashboard/stats — platform counts for the overview cards. */
export const getDashboardStats = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const [totalPlatforms, activePlatforms, inactivePlatforms] = await Promise.all([
    Platform.countDocuments({ user: user._id }),
    Platform.countDocuments({ user: user._id, status: "Active" }),
    Platform.countDocuments({ user: user._id, status: "Inactive" }),
  ]);

  sendSuccess(res, 200, "Dashboard statistics retrieved", {
    stats: { totalPlatforms, activePlatforms, inactivePlatforms },
  });
});
