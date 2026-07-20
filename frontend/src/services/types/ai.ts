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
  createdAt: string;
  updatedAt: string;
}

/** Request payload for creating/updating the AI configuration. */
export interface UpsertAiSettingsPayload {
  provider: AiProvider;
  model: string;
  /** Omitted on edit to keep the stored key; required on first create. */
  apiKey?: string;
}

/** Response `data` shape — `settings` is null when nothing is configured yet. */
export interface AiSettingsData {
  settings: AiSettings | null;
}

/** A single chat message (kept in memory only — no persistence). */
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Response `data` shape for a chat completion. */
export interface ChatResponseData {
  message: ChatMessage;
}
