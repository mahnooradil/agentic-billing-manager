/**
 * Zod schema for the AI recommendations request body (Phase 10).
 *
 * Both inputs are optional and clamped to safe defaults — the endpoint triggers
 * a billable AI generation, so a malformed value must never reach the provider
 * as-is. `range` reuses the Phase 9 analytics ranges for a consistent window.
 */
import { z } from "zod";

import { ANALYTICS_RANGES } from "@/validators/analytics.validator";

/** What the user wants the recommendations to focus on. */
export const RECOMMENDATION_FOCUSES = ["all", "overdue", "spend"] as const;
export type RecommendationFocus = (typeof RECOMMENDATION_FOCUSES)[number];

export const aiRecommendationsSchema = z.object({
  range: z.enum(ANALYTICS_RANGES).catch("all").default("all"),
  focus: z.enum(RECOMMENDATION_FOCUSES).catch("all").default("all"),
});

export type AiRecommendationsInput = z.infer<typeof aiRecommendationsSchema>;
