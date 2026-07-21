/**
 * Zod schemas for the recommendation module (Phase F1).
 * List filtering is read-only; the status update drives the lifecycle.
 */
import { z } from "zod";

import { RECOMMENDATION_STATUSES } from "@/models/recommendation.model";

/** Query filter for GET /api/recommendations (defaults to active). */
export const listRecommendationsQuerySchema = z.object({
  status: z.enum([...RECOMMENDATION_STATUSES, "all"]).catch("active").default("active"),
});

/** Body for PATCH /api/recommendations/:id/status. */
export const updateRecommendationStatusSchema = z.object({
  status: z.enum(RECOMMENDATION_STATUSES),
});

export type UpdateRecommendationStatusInput = z.infer<
  typeof updateRecommendationStatusSchema
>;
