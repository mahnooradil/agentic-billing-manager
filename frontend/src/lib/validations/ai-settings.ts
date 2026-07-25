/**
 * Client-side AI settings form schema. Mirrors the backend validator. The API
 * key may be left blank when editing (to keep the stored key); the form
 * component enforces that a key is present when creating for the first time.
 */
import { z } from "zod";

export const AI_PROVIDERS = ["OpenAI", "Gemini", "OpenRouter", "Claude"] as const;

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
  // Optional generation controls, held as strings in the form: empty means
  // "use the provider default". Validated as blank OR an in-range number.
  temperature: z
    .string()
    .trim()
    .refine((value) => {
      if (value === "") return true;
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 && n <= 2;
    }, "Temperature must be between 0 and 2"),
  maxTokens: z
    .string()
    .trim()
    .refine((value) => {
      if (value === "") return true;
      const n = Number(value);
      // Mirrors the backend floor: smaller caps truncate replies mid-sentence.
      return Number.isInteger(n) && n >= 256 && n <= 8192;
    }, "Max tokens must be a whole number between 256 and 8192 (smaller values cut replies off)"),
});

export type AiSettingsFormValues = z.infer<typeof aiSettingsFormSchema>;
