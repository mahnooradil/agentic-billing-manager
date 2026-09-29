import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  PlanData,
  UpdatePlanData,
  UpdatePlanPayload,
  PlanTier,
} from "@/services/types/plan";

/** GET /plan — the current user's plan, all tiers, and real usage counts. */
export function getMyPlan(): Promise<ApiSuccess<PlanData>> {
  return api.get<ApiSuccess<PlanData>>("/plan");
}

/** PUT /plan — self-service downgrade to Free ONLY. Reaching a paid tier
 *  goes through `createPlanCheckoutSession` below instead — see this
 *  endpoint's own backend docstring (plan.controller.ts) for why. */
export function updateMyPlan(
  payload: UpdatePlanPayload
): Promise<ApiSuccess<UpdatePlanData>> {
  return api.put<ApiSuccess<UpdatePlanData>>("/plan", payload);
}

/** POST /plan/checkout — starts a Stripe Checkout session for a paid tier;
 *  the plan itself only actually switches once Stripe confirms payment via
 *  webhook (see the credits "Buy more credits" flow's identical pattern). */
export function createPlanCheckoutSession(
  tier: Extract<PlanTier, "Pro" | "Business">
): Promise<ApiSuccess<{ url: string }>> {
  return api.post<ApiSuccess<{ url: string }>>("/plan/checkout", { tier });
}
