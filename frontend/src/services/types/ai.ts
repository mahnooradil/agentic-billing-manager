/**
 * AI provider settings types shared between the service layer and the UI.
 * The raw API key never crosses the wire — only a masked hint is returned.
 */
export type AiProvider = "OpenAI" | "Gemini" | "OpenRouter" | "Claude";

export interface AiSettings {
  id: string;
  provider: AiProvider;
  model: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  /** Sampling temperature (0–2), or null when unset (provider default). */
  temperature: number | null;
  /** Max response tokens, or null when unset (no explicit cap). */
  maxTokens: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Request payload for creating/updating the AI configuration. */
export interface UpsertAiSettingsPayload {
  provider: AiProvider;
  model: string;
  /** Omitted on edit to keep the stored key; required on first create. */
  apiKey?: string;
  /** A number sets it; `null` clears it (back to provider default). */
  temperature?: number | null;
  maxTokens?: number | null;
}

/** Response `data` shape — `settings` is null when nothing is configured yet. */
export interface AiSettingsData {
  settings: AiSettings | null;
}

/** A single chat message. Persisted client-side via the chat store. */
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Response `data` shape for a chat completion. */
export interface ChatResponseData {
  message: ChatMessage;
}
