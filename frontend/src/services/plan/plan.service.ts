import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { PlanData, UpdatePlanData, UpdatePlanPayload } from "@/services/types/plan";

/** GET /plan — the current user's plan, all tiers, and real usage counts. */
export function getMyPlan(): Promise<ApiSuccess<PlanData>> {
  return api.get<ApiSuccess<PlanData>>("/plan");
}

/** PUT /plan — switch the current user's plan tier (self-service, free). */
export function updateMyPlan(
  payload: UpdatePlanPayload
): Promise<ApiSuccess<UpdatePlanData>> {
  return api.put<ApiSuccess<UpdatePlanData>>("/plan", payload);
}
