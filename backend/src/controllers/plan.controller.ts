/**
 * Plan controllers — the organization's OWN subscription to this app (not to
 * be confused with the platforms it connects and gets billed by). Self-service:
 * there is no payment processor wired up yet, so switching tiers here is free
 * and immediate — but the stored tier and usage counts are real, not faked.
 * Limits gate the organization's SHARED resources, so only an owner/admin may
 * change the tier.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { PLANS, getPlan } from "@/config/plans";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Billing } from "@/models/billing.model";
import type { UpdatePlanInput } from "@/validators/plan.validator";

/** GET /api/plan — the organization's plan, its limits, and real usage counts. */
export const getMyPlan = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) throw new AppError("Authentication required", 401);

  const [platformConnections, billingRecords] = await Promise.all([
    PlatformConnection.countDocuments({ organization: organization._id, status: "connected" }),
    Billing.countDocuments({ organization: organization._id }),
  ]);

  sendSuccess(res, 200, "Plan retrieved", {
    plan: getPlan(organization.planTier),
    plans: Object.values(PLANS),
    usage: { platformConnections, billingRecords },
  });
});

/** PUT /api/plan — switch the organization's plan tier (self-service, free,
 *  owner/admin only). */
export const updateMyPlan = asyncHandler(async (req, res) => {
  const organization = req.organization;
  const membership = req.membership;
  if (!organization || !membership) throw new AppError("Authentication required", 401);
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can change the organization's plan.", 403);
  }

  const { tier } = req.body as UpdatePlanInput;
  organization.planTier = tier;
  await organization.save();

  sendSuccess(res, 200, "Plan updated", {
    plan: getPlan(organization.planTier),
  });
});
