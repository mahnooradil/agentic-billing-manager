/**
 * Plan controllers — the organization's OWN subscription to this app (not to
 * be confused with the platforms it connects and gets billed by).
 *
 * Task 10: a PAID tier (Pro/Business) is granted in exactly one place in
 * this codebase — `stripe-subscription.service.ts`'s `applySubscriptionEvent`,
 * driven only by a verified Stripe webhook. This controller can never grant
 * a paid tier directly: `updateMyPlan` (PUT) only ever accepts a downgrade
 * to Free (and cancels any active Stripe subscription when it happens, so
 * the customer actually stops being billed); reaching a paid tier goes
 * through `createPlanCheckout` (POST /checkout) instead, which only ever
 * hands back a Stripe Checkout URL — it never touches `planTier` itself.
 * Limits gate the organization's SHARED resources, so only an owner/admin
 * may change the tier.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { PLANS, getPlan, type PlanDefinition } from "@/config/plans";
import { CREDIT_ALLOWANCE_BY_PLAN, CREDIT_CYCLE_DAYS_BY_PLAN } from "@/config/credits";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Billing } from "@/models/billing.model";
import { EMAIL_SYNC_PLATFORMS } from "@/services/email-sync/registry";
import {
  createSubscriptionCheckoutSession,
  cancelActiveSubscription,
  isSubscriptionCheckoutConfigured,
} from "@/services/payments/stripe-subscription.service";
import type { UpdatePlanInput, CreatePlanCheckoutInput } from "@/validators/plan.validator";

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

/** PUT /api/plan — self-service downgrade to Free ONLY (owner/admin only).
 *  A paid tier is never grantable through this route — see the module
 *  docstring and `createPlanCheckout` below. */
export const updateMyPlan = asyncHandler(async (req, res) => {
  const organization = req.organization;
  const membership = req.membership;
  if (!organization || !membership) throw new AppError("Authentication required", 401);
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can change the organization's plan.", 403);
  }

  const { tier } = req.body as UpdatePlanInput;
  if (tier !== "Free") {
    throw new AppError(
      "Upgrading to a paid plan happens through checkout, not this endpoint.",
      400
    );
  }

  // Actually stop the billing, not just the local flag — otherwise a
  // customer who downgrades here while Stripe still has an active
  // subscription keeps being charged for a tier this app now says they
  // don't have.
  await cancelActiveSubscription(organization);

  organization.planTier = "Free";
  await organization.save();

  sendSuccess(res, 200, "Plan updated", {
    plan: withCredits(getPlan(organization.planTier)),
  });
});

/** POST /api/plan/checkout — starts a Stripe Checkout session for a paid
 *  tier (owner/admin only). Never writes `planTier` itself — only the
 *  webhook-driven `applySubscriptionEvent` does that, once Stripe actually
 *  confirms the subscription. */
export const createPlanCheckout = asyncHandler(async (req, res) => {
  const organization = req.organization;
  const membership = req.membership;
  const user = req.user;
  if (!organization || !membership || !user) throw new AppError("Authentication required", 401);
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can change the organization's plan.", 403);
  }
  if (!isSubscriptionCheckoutConfigured()) {
    throw new AppError("Plan checkout isn't configured on this server yet.", 503);
  }

  const { tier } = req.body as CreatePlanCheckoutInput;
  const { url } = await createSubscriptionCheckoutSession(organization, user.email, tier);

  sendSuccess(res, 200, "Checkout session created", { url });
});
