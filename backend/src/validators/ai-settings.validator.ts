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
});

export type UpsertAiSettingsInput = z.infer<typeof upsertAiSettingsSchema>;
