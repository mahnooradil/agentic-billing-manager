/**
 * Zod schema for the user settings (preferences) request body.
 *
 * Every group and field is OPTIONAL: the client may send the full object or any
 * subset, and the controller deep-merges the validated body over the user's
 * existing settings, so omitted groups are never wiped. Ranges/enums mirror the
 * Mongoose schema in `user-settings.model.ts`.
 */
import { z } from "zod";

import {
  DATE_FORMATS,
  LANGUAGES,
  SETTINGS_ANALYTICS_RANGES,
  RECOMMENDATION_FOCUSES,
  THEMES,
} from "@/models/user-settings.model";

const generalSchema = z
  .object({
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code"),
    dateFormat: z.enum(DATE_FORMATS),
    timezone: z.string().trim().min(1).max(64),
    language: z.enum(LANGUAGES),
  })
  .partial();

const notificationsSchema = z
  .object({
    enabled: z.boolean(),
    billingAlerts: z.boolean(),
    recommendationAlerts: z.boolean(),
    usageAlerts: z.boolean(),
    highSpendThreshold: z.number().int().min(1).max(100),
  })
  .partial();

const analyticsSchema = z
  .object({
    defaultRange: z.enum(SETTINGS_ANALYTICS_RANGES),
    trendMonths: z.number().int().min(1).max(36),
    concentrationThreshold: z.number().int().min(1).max(100),
    highCostThreshold: z.number().int().min(1).max(100),
    growthAlertThreshold: z.number().int().min(1).max(100),
  })
  .partial();

const automationSchema = z
  .object({
    enabled: z.boolean(),
    autoApprove: z.boolean(),
  })
  .partial();

const memorySchema = z
  .object({
    enabled: z.boolean(),
    maxRecall: z.number().int().min(1).max(100),
    summarizeTrigger: z.number().int().min(2).max(200),
    keepRecent: z.number().int().min(1).max(100),
  })
  .partial();

const recommendationsSchema = z
  .object({
    maxCount: z.number().int().min(1).max(20),
    defaultFocus: z.enum(RECOMMENDATION_FOCUSES),
  })
  .partial();

const workspaceSchema = z
  .object({
    displayName: z.string().trim().max(80),
  })
  .partial();

const appearanceSchema = z
  .object({
    theme: z.enum(THEMES),
  })
  .partial();

export const updateUserSettingsSchema = z
  .object({
    general: generalSchema,
    notifications: notificationsSchema,
    analytics: analyticsSchema,
    automation: automationSchema,
    memory: memorySchema,
    recommendations: recommendationsSchema,
    workspace: workspaceSchema,
    appearance: appearanceSchema,
  })
  .partial();

export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>;
