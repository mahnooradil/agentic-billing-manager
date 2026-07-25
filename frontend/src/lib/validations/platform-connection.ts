/**
 * Client-side schema for the Connect / Rename form (Phase F8). Mirrors the
 * backend validator. `accountIdentifier` is optional (may be left blank).
 */
import { z } from "zod";

export const connectionFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(100, "Display name must be at most 100 characters"),
});

export type ConnectionFormValues = z.infer<typeof connectionFormSchema>;

/** Website: empty or a valid URL. */
const optionalUrl = z.union([
  z.literal(""),
  z.string().trim().url("Enter a valid URL (https://…)").max(300),
]);

export const customPlatformFormSchema = z.object({
  platform: z
    .string()
    .trim()
    .min(2, "Platform name is required")
    .max(60, "Platform name must be at most 60 characters"),
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(100, "Display name must be at most 100 characters"),
  description: z
    .string()
    .trim()
    .max(300, "Description must be at most 300 characters"),
  website: optionalUrl,
});

export type CustomPlatformFormValues = z.infer<typeof customPlatformFormSchema>;

export const apiKeyConnectSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(100, "Display name must be at most 100 characters"),
  apiKey: z
    .string()
    .trim()
    .min(8, "Enter the full API key")
    .max(500, "API key must be at most 500 characters"),
});

export type ApiKeyConnectValues = z.infer<typeof apiKeyConnectSchema>;
