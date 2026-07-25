/**
 * Zod schema for the AI settings request body. One upsert schema covers both
 * create and edit. `apiKey` is optional so an edit can keep the stored key
 * without re-sending it; the controller enforces that a key exists on create.
 */
import { z } from "zod";

import { AI_PROVIDERS } from "@/models/ai-settings.model";

export const upsertAiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z
    .string()
    .trim()
    .min(1, "Model name is required")
    .max(100, "Model name must be at most 100 characters"),
  apiKey: z
    .string()
    .trim()
    .min(8, "API key must be at least 8 characters")
    .max(500, "API key must be at most 500 characters")
    .optional(),
  // Optional generation controls. `null` explicitly clears a stored value
  // (revert to the provider default); omitted leaves it unchanged.
  temperature: z
    .number()
    .min(0, "Temperature must be at least 0")
    .max(2, "Temperature must be at most 2")
    .nullable()
    .optional(),
  maxTokens: z
    .number()
    .int("Max tokens must be a whole number")
    // A very small cap truncates replies mid-sentence, so the assistant looks
    // broken. 256 is the lowest value that still yields a usable answer.
    .min(256, "Max tokens must be at least 256 (smaller values cut replies off)")
    .max(8192, "Max tokens must be at most 8192")
    .nullable()
    .optional(),
});

export type UpsertAiSettingsInput = z.infer<typeof upsertAiSettingsSchema>;
