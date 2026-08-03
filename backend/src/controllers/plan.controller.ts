/**
 * Plan controllers — the user's OWN subscription to this app (not to be
 * confused with the platforms they connect and get billed by). Self-service:
 * there is no payment processor wired up yet, so switching tiers here is free
 * and immediate — but the stored tier and usage counts are real, not faked.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { PLANS, getPlan } from "@/config/plans";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Billing } from "@/models/billing.model";
import type { UpdatePlanInput } from "@/validators/plan.validator";

/** GET /api/plan — the current user's plan, its limits, and real usage counts. */
export const getMyPlan = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError("Authentication required", 401);

  const [platformConnections, billingRecords] = await Promise.all([
    PlatformConnection.countDocuments({ user: user._id, status: "connected" }),
    Billing.countDocuments({ user: user._id }),
  ]);

  sendSuccess(res, 200, "Plan retrieved", {
    plan: getPlan(user.planTier),
    plans: Object.values(PLANS),
    usage: { platformConnections, billingRecords },
  });
});

/** PUT /api/plan — switch the current user's plan tier (self-service, free). */
export const updateMyPlan = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError("Authentication required", 401);

  const { tier } = req.body as UpdatePlanInput;
  user.planTier = tier;
  await user.save();

  sendSuccess(res, 200, "Plan updated", {
    plan: getPlan(user.planTier),
  });
});
