/**
 * Converts an AI settings document into the shape returned to API clients.
 * The raw/encrypted API key is NEVER included — only a masked hint derived
 * from the stored last-four characters.
 */
import type { AiProvider, AiSettingsDocument } from "@/models/ai-settings.model";

export interface PublicAiSettings {
  id: string;
  provider: AiProvider;
  model: string;
  /** True once an API key has been saved. */
  hasApiKey: boolean;
  /** Masked hint, e.g. "••••••••ab12". Empty when no key is stored. */
  maskedApiKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicAiSettings(
  settings: AiSettingsDocument
): PublicAiSettings {
  const last4 = settings.apiKeyLast4;
  return {
    id: settings._id.toString(),
    provider: settings.provider,
    model: settings.model,
    hasApiKey: Boolean(last4),
    maskedApiKey: last4 ? `••••••••${last4}` : "",
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}
