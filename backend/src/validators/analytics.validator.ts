/**
 * Zod schema for the analytics overview query. The endpoint is read-only; the
 * main input is an optional `range` selecting the time window, plus `from`/`to`
 * when `range` is `custom`. Kept small and strict so a malformed value is
 * clamped to a safe default rather than reaching the aggregation pipeline.
 */
import { z } from "zod";

/** Supported analytics time ranges. Single source of truth for API + UI. */
export const ANALYTICS_RANGES = ["all", "3m", "6m", "12m", "custom"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Number of months each bounded, non-custom range looks back over
 *  (`all`/`custom` have no fixed month count — see `buildRangeMatch`). */
export const ANALYTICS_RANGE_MONTHS: Record<
  Exclude<AnalyticsRange, "all" | "custom">,
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
  // Only read when range === "custom"; a plain YYYY-MM-DD (from an <input
  // type="date">) or a full ISO string both parse fine below.
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
});

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
