/**
 * Zod schema for the analytics overview query. The endpoint is read-only; the
 * only input is an optional `range` selecting the time window. Kept small and
 * strict so a malformed value is clamped to a safe default rather than reaching
 * the aggregation pipeline.
 */
import { z } from "zod";

/** Supported analytics time ranges. Single source of truth for API + UI. */
export const ANALYTICS_RANGES = ["all", "3m", "6m", "12m"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Number of months each bounded range looks back over (`all` = no bound). */
export const ANALYTICS_RANGE_MONTHS: Record<
  Exclude<AnalyticsRange, "all">,
  number
> = {
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

export const analyticsQuerySchema = z.object({
  // Unknown/empty values fall back to "all" instead of erroring — this is a
  // read-only dashboard query, not a mutation.
  range: z.enum(ANALYTICS_RANGES).catch("all").default("all"),
});

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
