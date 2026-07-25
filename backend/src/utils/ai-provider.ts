/**
 * Outbound AI provider client (Phase 8B).
 *
 * Sends a chat conversation to the configured provider and returns the assistant
 * reply text. Uses the built-in `fetch` — no SDK dependency. Failures are mapped
 * to clean `AppError`s; provider error bodies are never forwarded (they can echo
 * key fragments), and the API key is never logged.
 */
import { AppError } from "@/utils/appError";
import type { AiProvider } from "@/models/ai-settings.model";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface GenerateParams {
  provider: AiProvider;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  /**
   * Optional system instruction (Phase 11). Injected per provider in the correct
   * place: OpenAI/OpenRouter as a leading `system` message, Claude as the
   * top-level `system` field, Gemini as `systemInstruction`. When omitted, the
   * request is byte-for-byte identical to before (existing callers unaffected).
   */
  system?: string;
  /**
   * Optional sampling temperature (0–2) and max response tokens (Phase F7).
   * Both come from the user's AI settings. When undefined the request is
   * byte-for-byte identical to pre-F7 (no temperature; Claude keeps its 1024
   * default; other providers send no token cap).
   */
  temperature?: number;
  maxTokens?: number;
}

// Endpoints + constants. Exported so the tool-calling module (UI-Agent.2) shares
// exactly the same wire targets and defaults as the plain chat path.
export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
// Claude's Messages API REQUIRES max_tokens; unlike other providers there is no
// "unlimited" default. 1024 clipped long answers mid-sentence — 4096 is a
// generous default for chat while still respecting an explicit user cap (F7).
export const CLAUDE_MAX_TOKENS = 4096;

/**
 * Anthropic accepts temperature in 0..1, while OpenAI/Gemini allow 0..2 (which
 * is what the settings UI permits). Clamp per-provider so a value that is
 * perfectly valid for another provider can never 400 the entire request.
 */
export function clampClaudeTemperature(temperature: number): number {
  return Math.min(Math.max(temperature, 0), 1);
}

/** Maps an upstream HTTP status to a clean, secret-free error (never a 401). */
export function providerError(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError(
      "The AI provider rejected your API key. Please check your AI settings.",
      502
    );
  }
  if (status === 404) {
    return new AppError(
      "The configured model was not found for this provider.",
      502
    );
  }
  if (status === 429) {
    return new AppError(
      "The AI provider rate limit was reached. Please try again shortly.",
      502
    );
  }
  return new AppError(
    "The AI provider could not process the request. Please try again.",
    502
  );
}

/** POSTs JSON and returns the parsed body, mapping network failures cleanly. */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<{ ok: boolean; status: number; data: unknown }> {
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AppError("Unable to reach the AI provider. Please try again.", 502);
  }
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

/** OpenAI and OpenRouter share the same chat-completions request/response shape. */
async function callOpenAiCompatible(
  url: string,
  params: GenerateParams
): Promise<string> {
  // OpenAI/OpenRouter take the system instruction as a leading `system` message.
  const messages: { role: string; content: string }[] = params.system
    ? [{ role: "system", content: params.system }, ...params.messages]
    : params.messages;

  const { ok, status, data } = await postJson(
    url,
    { Authorization: `Bearer ${params.apiKey}` },
    {
      model: params.model,
      messages,
      ...(params.temperature !== undefined
        ? { temperature: params.temperature }
        : {}),
      ...(params.maxTokens !== undefined
        ? { max_tokens: params.maxTokens }
        : {}),
    }
  );
  if (!ok) throw providerError(status);

  const content = (
    data as { choices?: { message?: { content?: string } }[] } | null
  )?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AppError("The AI provider returned an empty response.", 502);
  }
  return content;
}

interface GeminiErrorBody {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: { reason?: string }[];
  };
}

/** Shows only the last 4 chars of a key for safe diagnostics. */
function maskKey(key: string): string {
  return key.length <= 4 ? "****" : `****${key.slice(-4)}`;
}

/** Removes anything resembling a Google API key from a string — both legacy
 *  "AIza" traffic keys and the new AI Studio auth keys ("AQ." / "AG." prefix) —
 *  so a key is never leaked in logs regardless of format. */
function redactKeys(text: string): string {
  return text.replace(
    /\b(AIza|AQ\.|AG\.)[A-Za-z0-9._-]{6,}/g,
    "$1***REDACTED***"
  );
}

/**
 * Maps a Gemini error response to a clear AppError, surfacing Google's real
 * reason instead of collapsing every failure into one generic message. Logs the
 * raw (masked) upstream error server-side for diagnosis. Never exposes the key.
 */
function geminiError(httpStatus: number, data: unknown): AppError {
  const error = (data as GeminiErrorBody | null)?.error;
  const gStatus = error?.status ?? "";
  const gCode = error?.code ?? httpStatus;
  const reason = error?.details?.find((detail) => detail?.reason)?.reason ?? "";
  const message = redactKeys(error?.message ?? "");

  // Server-side diagnostic (masked) so the real upstream cause is visible.
  console.error(
    `[ai-provider][gemini] upstream error: http=${httpStatus} code=${gCode} status=${gStatus} reason=${reason} message=${message}`
  );

  if (reason === "API_KEY_INVALID") {
    return new AppError(
      "Gemini rejected the API key (API_KEY_INVALID). Please check the key in AI Settings.",
      502
    );
  }
  if (reason === "SERVICE_DISABLED") {
    return new AppError(
      "The Generative Language API is not enabled for this key's Google project. Enable it in Google Cloud, then try again.",
      502
    );
  }
  if (gStatus === "PERMISSION_DENIED" || httpStatus === 403) {
    return new AppError(
      `Gemini denied access (PERMISSION_DENIED). ${
        message ||
        "Ensure the Generative Language API is enabled and the key is unrestricted."
      }`.trim(),
      502
    );
  }
  if (gStatus === "NOT_FOUND" || httpStatus === 404) {
    return new AppError(
      `Gemini model not found (NOT_FOUND). Check the model id. ${message}`.trim(),
      502
    );
  }
  if (gStatus === "RESOURCE_EXHAUSTED" || httpStatus === 429) {
    return new AppError(
      "Gemini quota or rate limit exceeded (RESOURCE_EXHAUSTED). Please try again later.",
      502
    );
  }
  if (gStatus === "FAILED_PRECONDITION") {
    return new AppError(
      `Gemini request failed (FAILED_PRECONDITION). ${
        message ||
        "Your location may not be supported, or billing must be enabled."
      }`.trim(),
      502
    );
  }
  if (gStatus === "UNAUTHENTICATED" || httpStatus === 401) {
    return new AppError(
      "Gemini rejected the credentials (UNAUTHENTICATED). New AI Studio auth keys (AQ./AG. prefix) are still being rolled out by Google for the REST API and may not work yet; otherwise verify the key in AI Settings.",
      502
    );
  }
  if (gStatus === "INVALID_ARGUMENT") {
    return new AppError(
      "Gemini rejected the request (INVALID_ARGUMENT). Please check the API key and model.",
      502
    );
  }
  return new AppError(
    `Gemini request failed${gStatus ? ` (${gStatus})` : ""}. ${
      message || "Please try again."
    }`.trim(),
    502
  );
}

/** Current default Gemini model, used when the configured one is empty or a
 *  known-deprecated id. Google's recommended default for new integrations
 *  (Stable) per https://ai.google.dev/gemini-api/docs/models. */
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

/** Retired/deprecated Gemini model ids that are remapped to the default. */
const DEPRECATED_GEMINI_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro",
  "gemini-1.5-pro-latest",
  "gemini-1.0-pro",
  "gemini-pro",
]);

/**
 * Resolves the Gemini model id to send: deprecated or empty ids fall back to the
 * current default, while any other (custom) model is passed through unchanged so
 * advanced users can target newer/specific models.
 */
export function resolveGeminiModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed || DEPRECATED_GEMINI_MODELS.has(trimmed.toLowerCase())) {
    return DEFAULT_GEMINI_MODEL;
  }
  return trimmed;
}

async function callGemini(params: GenerateParams): Promise<string> {
  const model = resolveGeminiModel(params.model);
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;
  const contents = params.messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  // Gemini takes the system instruction as a dedicated `systemInstruction`, and
  // temperature / max tokens inside `generationConfig` (added only when set).
  const generationConfig: { temperature?: number; maxOutputTokens?: number } = {};
  if (params.temperature !== undefined)
    generationConfig.temperature = params.temperature;
  if (params.maxTokens !== undefined)
    generationConfig.maxOutputTokens = params.maxTokens;

  const body = {
    contents,
    ...(params.system
      ? { systemInstruction: { parts: [{ text: params.system }] } }
      : {}),
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  };

  // Diagnostic: endpoint + model (in the URL) + masked key only. The request
  // body is intentionally NOT logged — it carries conversation content (privacy).
  console.error(
    `[ai-provider][gemini] request: POST ${url} | x-goog-api-key=${maskKey(
      params.apiKey
    )}`
  );

  // Gemini authenticates via the `x-goog-api-key` header (Google's recommended
  // method) — this also keeps the key out of the request URL so it is never
  // logged as part of the query string.
  const { ok, status, data } = await postJson(
    url,
    { "x-goog-api-key": params.apiKey },
    body
  );
  if (!ok) throw geminiError(status, data);

  const content = (
    data as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null
  )?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== "string" || !content.trim()) {
    throw new AppError("The AI provider returned an empty response.", 502);
  }
  return content;
}

/** Anthropic Claude via the official Messages API. Model comes from settings. */
async function callClaude(params: GenerateParams): Promise<string> {
  const { ok, status, data } = await postJson(
    ANTHROPIC_URL,
    {
      "x-api-key": params.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    {
      model: params.model,
      // Claude requires max_tokens; use the configured cap or the 1024 default.
      max_tokens: params.maxTokens ?? CLAUDE_MAX_TOKENS,
      ...(params.temperature !== undefined
        ? { temperature: clampClaudeTemperature(params.temperature) }
        : {}),
      // Claude takes the system instruction as a top-level `system` field.
      ...(params.system ? { system: params.system } : {}),
      messages: params.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    }
  );
  if (!ok) throw providerError(status);

  // Concatenate every text block from content[] (ignoring non-text blocks such
  // as thinking/tool_use), matching the official Anthropic SDK behavior.
  const blocks =
    (data as { content?: { type?: string; text?: string }[] } | null)
      ?.content ?? [];
  const content = blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  if (!content.trim()) {
    throw new AppError("The AI provider returned an empty response.", 502);
  }
  return content;
}

/** Sends the conversation to the configured provider and returns the reply. */
export async function generateChatCompletion(
  params: GenerateParams
): Promise<string> {
  switch (params.provider) {
    case "OpenAI":
      return callOpenAiCompatible(OPENAI_URL, params);
    case "OpenRouter":
      return callOpenAiCompatible(OPENROUTER_URL, params);
    case "Gemini":
      return callGemini(params);
    case "Claude":
      return callClaude(params);
    default:
      throw new AppError("Unsupported AI provider.", 400);
  }
}
