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
  LANDING_PAGES,
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
    defaultLandingPage: z.enum(LANDING_PAGES),
  })
  .partial();

/** Slack's own "Incoming Webhook" URL format — restricted to this exact
 *  host so the server never ends up POSTing to an arbitrary/internal URL
 *  a user could otherwise supply here. An empty string clears it. */
const SLACK_WEBHOOK_REGEX = /^https:\/\/hooks\.slack\.com\/services\/.+$/;

const notificationsSchema = z
  .object({
    enabled: z.boolean(),
    billingAlerts: z.boolean(),
    recommendationAlerts: z.boolean(),
    usageAlerts: z.boolean(),
    highSpendThreshold: z.number().int().min(1).max(100),
    slackWebhookUrl: z
      .string()
      .trim()
      .max(500)
      .refine(
        (value) => value === "" || SLACK_WEBHOOK_REGEX.test(value),
        "Must be a Slack Incoming Webhook URL (https://hooks.slack.com/services/...)"
      ),
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
    appearance: appearanceSchema,
  })
  .partial();

export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>;
