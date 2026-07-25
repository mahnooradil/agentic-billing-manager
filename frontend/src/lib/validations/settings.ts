/**
 * Client-side settings form schema (Phase F7). Mirrors the backend validator in
 * `user-settings.validator.ts`. Numbers are coerced (number inputs yield strings)
 * so the resolved payload carries real numbers, as the API expects.
 */
import { z } from "zod";

import {
  DATE_FORMATS,
  SETTINGS_ANALYTICS_RANGES,
  RECOMMENDATION_FOCUSES,
} from "@/services/types/settings";

// Numeric inputs are registered with `valueAsNumber`, so the value is a real
// number (or NaN when the field is emptied — reported as "must be a number").
const intInRange = (min: number, max: number, label: string) =>
  z
    .number({ message: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

export const settingsFormSchema = z.object({
  general: z.object({
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code (e.g. USD)"),
    dateFormat: z.enum(DATE_FORMATS),
    timezone: z.string().trim().min(1, "Timezone is required").max(64),
  }),
  notifications: z.object({
    enabled: z.boolean(),
    billingAlerts: z.boolean(),
    recommendationAlerts: z.boolean(),
    usageAlerts: z.boolean(),
    highSpendThreshold: intInRange(1, 100, "High-spend threshold"),
  }),
  analytics: z.object({
    defaultRange: z.enum(SETTINGS_ANALYTICS_RANGES),
    trendMonths: intInRange(1, 36, "Trend months"),
    concentrationThreshold: intInRange(1, 100, "Concentration threshold"),
    highCostThreshold: intInRange(1, 100, "High-cost threshold"),
    growthAlertThreshold: intInRange(1, 100, "Growth alert threshold"),
  }),
  automation: z.object({
    enabled: z.boolean(),
    autoApprove: z.boolean(),
  }),
  memory: z.object({
    enabled: z.boolean(),
    maxRecall: intInRange(1, 100, "Max recall"),
    summarizeTrigger: intInRange(2, 200, "Summarize trigger"),
    keepRecent: intInRange(1, 100, "Keep recent"),
  }),
  recommendations: z.object({
    maxCount: intInRange(1, 20, "Max recommendations"),
    defaultFocus: z.enum(RECOMMENDATION_FOCUSES),
  }),
  workspace: z.object({
    displayName: z.string().trim().max(80, "Display name must be at most 80 characters"),
  }),
  // Appearance (theme) is managed via next-themes for instant apply, not RHF,
  // and appended to the payload at submit time — see the Settings view.
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
