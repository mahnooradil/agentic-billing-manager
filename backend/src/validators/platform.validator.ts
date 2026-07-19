/**
 * Zod schemas for platform request bodies. Single source of truth for the
 * create/update input rules; kept in sync with the Mongoose schema.
 */
import { z } from "zod";

import { PLATFORM_STATUSES } from "@/models/platform.model";

/** URL-friendly slug: lowercase letters, numbers, and single hyphens. */
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const optionalUrl = z
  .string()
  .trim()
  .url("Must be a valid URL (including http:// or https://)")
  .optional();

export const createPlatformSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Slug must be at least 2 characters")
    .max(100, "Slug must be at most 100 characters")
    .regex(SLUG_REGEX, "Slug may contain only lowercase letters, numbers, and hyphens"),
  description: z
    .string()
    .trim()
    .max(500, "Description must be at most 500 characters")
    .optional(),
  website: optionalUrl,
  logo: optionalUrl,
  status: z.enum(PLATFORM_STATUSES).optional(),
});

/** Update allows any subset of the create fields. */
export const updatePlatformSchema = createPlatformSchema.partial();

export type CreatePlatformInput = z.infer<typeof createPlatformSchema>;
export type UpdatePlatformInput = z.infer<typeof updatePlatformSchema>;
