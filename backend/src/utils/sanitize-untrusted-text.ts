/**
 * Shared prompt-injection defense-in-depth helpers (Task 9). Two independent
 * layers use the same pattern list on purpose — see each call site's own
 * comment for why one layer alone isn't considered sufficient:
 *   1. ai-invoice-extractor.ts sanitizes an extracted string the moment it
 *      comes back from the model, before it's ever persisted (ingest).
 *   2. managed-agent.service.ts sanitizes a tool result again right before
 *      it's rendered into the agent's own context (render) — a second,
 *      independent pass in case anything reaches that boundary from a path
 *      that didn't go through step 1 (a future tool, a different field).
 *
 * Neither layer is a complete defense on its own — no fixed pattern list
 * can be, against an adversary who can rephrase indefinitely — this is
 * defense in depth alongside the extraction call's own system-prompt
 * framing (which is the primary defense against the MODEL actually being
 * steered) and the forced tool-call schema (which bounds what shape a
 * response can even take).
 */

/** Instruction-shaped phrases redacted wherever untrusted, model-adjacent
 *  text is sanitized. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(the\s+)?(all\s+|any\s+)?(previous|prior|above|earlier)\s+instructions?/gi,
  /disregard\s+(the\s+)?(all\s+|any\s+)?(previous|prior|above|earlier)/gi,
  /forget\s+(everything|all)\s+(above|before|prior)/gi,
  /\bsystem\s*:/gi,
  /\bassistant\s*:/gi,
  /\byou\s+are\s+now\b/gi,
  /\bnew\s+instructions?\s*:/gi,
  /\bact\s+as\s+(a|an)\b/gi,
];

/** Strips control characters and neutralizes instruction-shaped patterns in
 *  one string, then caps its length. */
export function sanitizeUntrustedText(value: string, maxLength: number): string {
  let cleaned = value
    // eslint-disable-next-line no-control-regex -- deliberately matching control chars to strip them
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim();
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[redacted]");
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

const MAX_AGENT_CONTEXT_STRING_LENGTH = 2000;
/** Bounds how deep the recursive walk below goes — a tool result is always a
 *  small, flat-ish plain object in this codebase; this is a safety cap
 *  against an unexpectedly deep/cyclic structure, not a real limitation. */
const MAX_DEPTH = 6;

/** Recursively sanitizes every string value in an arbitrary tool-result
 *  value before it's rendered into the agent's own context — see the module
 *  docstring for why this exists as a SECOND pass alongside ingest-time
 *  sanitization, not a replacement for it. Non-string, non-container values
 *  (numbers, booleans, null) pass through unchanged. */
export function sanitizeForAgentContext(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return value;
  if (typeof value === "string") {
    return sanitizeUntrustedText(value, MAX_AGENT_CONTEXT_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAgentContext(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = sanitizeForAgentContext(val, depth + 1);
    }
    return result;
  }
  return value;
}
