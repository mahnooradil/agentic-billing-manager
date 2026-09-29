import { z } from "zod";

import { PLAN_TIERS } from "@/config/plans";

export const updatePlanSchema = z.object({
  tier: z.enum(PLAN_TIERS),
});

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

/** POST /api/plan/checkout — only the two PAID tiers have a Stripe Price to
 *  check out for; Free is reached via `PUT /api/plan` instead (see
 *  plan.controller.ts's own scope split between the two endpoints). */
export const createPlanCheckoutSchema = z.object({
  tier: z.enum(["Pro", "Business"]),
});

export type CreatePlanCheckoutInput = z.infer<typeof createPlanCheckoutSchema>;
