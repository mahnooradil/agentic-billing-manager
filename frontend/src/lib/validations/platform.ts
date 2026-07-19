/**
 * Client-side platform form schema. Rules mirror the backend Zod validators
 * (name 2–100, slug pattern, optional URLs, status enum) for fast UX feedback.
 * The backend remains the source of truth.
 */
import { z } from "zod";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Optional URL field that also accepts an empty string (empty form input).
const optionalUrl = z.union([
  z.literal(""),
  z.string().trim().url("Must be a valid URL (including http:// or https://)"),
]);

export const platformFormSchema = z.object({
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
    .regex(
      SLUG_REGEX,
      "Use lowercase letters, numbers, and single hyphens only"
    ),
  description: z
    .string()
    .trim()
    .max(500, "Description must be at most 500 characters"),
  website: optionalUrl,
  logo: optionalUrl,
  status: z.enum(["Active", "Inactive"]),
});

export type PlatformFormValues = z.infer<typeof platformFormSchema>;
