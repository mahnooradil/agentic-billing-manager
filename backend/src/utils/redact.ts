/**
 * Secret redaction guard (UI-Agent.4) — defense-in-depth.
 *
 * The Cardinal Invariant already keeps credentials out of the LLM, memory, and
 * logs by construction (no code path carries them there). This scrubber is the
 * belt to that suspenders: applied to anything persisted to conversation memory
 * and to any operational log line, so a credential can NEVER survive even if a
 * future change accidentally routed one through. Pattern-based and conservative.
 */

// Known provider key shapes + generic bearer/long-token forms.
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{12,}/g, // Anthropic (before generic sk-)
  /\bsk-or-[A-Za-z0-9_-]{12,}/g, // OpenRouter
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI / generic sk-
  /\b(?:AIza|AQ\.|AG\.)[A-Za-z0-9._-]{10,}/g, // Google API keys
  /\bghp_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\bBearer\s+[A-Za-z0-9._-]{16,}/gi, // Authorization bearer values
];

/** Replaces any credential-shaped substring with a redaction marker. */
export function redactSecrets(text: string): string {
  if (!text) return text;
  let output = text;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, "[REDACTED]");
  }
  return output;
}
