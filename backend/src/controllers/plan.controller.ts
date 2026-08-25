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
import { PLANS, getPlan, type PlanDefinition } from "@/config/plans";
import { CREDIT_ALLOWANCE_BY_PLAN, CREDIT_CYCLE_DAYS_BY_PLAN } from "@/config/credits";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Billing } from "@/models/billing.model";
import { EMAIL_SYNC_PLATFORMS } from "@/services/email-sync/registry";
import type { UpdatePlanInput } from "@/validators/plan.validator";

/**
 * Attaches the plan's credit allowance/cycle for display purposes only —
 * composed here, not stored on `PlanDefinition` itself (see
 * config/plans.ts's docstring: credits are a separate system from plan
 * limits, config/credits.ts owns these numbers and knows nothing about this
 * file, this controller is just where the two get shown together).
 */
function withCredits(plan: PlanDefinition) {
  return {
    ...plan,
    credits: {
      allowance: CREDIT_ALLOWANCE_BY_PLAN[plan.tier],
      cycleDays: CREDIT_CYCLE_DAYS_BY_PLAN[plan.tier],
    },
  };
}

/** GET /api/plan — the organization's plan, its limits, and real usage counts. */
export const getMyPlan = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) throw new AppError("Authentication required", 401);

  const [platformConnections, billingRecords] = await Promise.all([
    // Gmail/Outlook email-sync connections don't count against this limit —
    // see plan-limits.ts's assertPlatformConnectionLimit for why.
    PlatformConnection.countDocuments({
      organization: organization._id,
      status: "connected",
      platform: { $nin: [...EMAIL_SYNC_PLATFORMS] },
    }),
    Billing.countDocuments({ organization: organization._id }),
  ]);

  sendSuccess(res, 200, "Plan retrieved", {
    plan: withCredits(getPlan(organization.planTier)),
    plans: Object.values(PLANS).map(withCredits),
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
    plan: withCredits(getPlan(organization.planTier)),
  });
});
