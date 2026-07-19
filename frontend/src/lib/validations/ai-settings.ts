/**
 * Client-side AI settings form schema. Mirrors the backend validator. The API
 * key may be left blank when editing (to keep the stored key); the form
 * component enforces that a key is present when creating for the first time.
 */
import { z } from "zod";

export const AI_PROVIDERS = ["OpenAI", "Gemini", "OpenRouter"] as const;

export const aiSettingsFormSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z
    .string()
    .trim()
    .min(1, "Model name is required")
    .max(100, "Model name must be at most 100 characters"),
  apiKey: z
    .string()
    .trim()
    .max(500, "API key must be at most 500 characters")
    .refine(
      (value) => value === "" || value.length >= 8,
      "API key must be at least 8 characters"
    ),
});

export type AiSettingsFormValues = z.infer<typeof aiSettingsFormSchema>;
