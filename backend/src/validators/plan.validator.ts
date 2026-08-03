import { z } from "zod";

import { PLAN_TIERS } from "@/config/plans";

export const updatePlanSchema = z.object({
  tier: z.enum(PLAN_TIERS),
});

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
