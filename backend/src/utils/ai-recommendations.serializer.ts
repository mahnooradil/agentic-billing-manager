/**
 * AI recommendations serializer — Phase 10.
 *
 * Defines the wire shape of `POST /api/ai/recommendations` and defensively parses
 * the model's reply into typed items. LLM output is never fully trusted: we strip
 * code fences, extract the JSON, validate each item, normalize severity, clamp
 * lengths, and fall back to a single text recommendation if parsing fails — so a
 * chatty or malformed model reply degrades gracefully instead of erroring.
 *
 * `severity` + `category` + `suggestedAction` are deliberately machine-readable:
 * they are the signal a future Alerts/Notifications/automation phase will consume.
 */
import { z } from "zod";

/** Priority of a recommendation — the seed for future alert thresholds. */
export const RECOMMENDATION_SEVERITIES = ["low", "medium", "high"] as const;
export type RecommendationSeverity = (typeof RECOMMENDATION_SEVERITIES)[number];

export interface AiRecommendation {
  title: string;
  detail: string;
  severity: RecommendationSeverity;
  category: string;
  /** A concrete next step — groundwork for future automated action-triggering. */
  suggestedAction: string;
}

/** Max recommendations surfaced from a single generation. */
const MAX_RECOMMENDATIONS = 8;

/** Normalizes free-form severity text to the allowed set (default "medium"). */
const severitySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.toLowerCase().trim() : value),
  z.enum(RECOMMENDATION_SEVERITIES).catch("medium")
);

const itemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(600),
  severity: severitySchema,
  category: z.string().trim().min(1).max(40).catch("general").default("general"),
  suggestedAction: z
    .string()
    .trim()
    .max(300)
    .catch("")
    .default(""),
});

/** Best-effort extraction of a JSON value from a possibly-chatty model reply. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to substring extraction */
  }

  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    } catch {
      /* fall through */
    }
  }

  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try {
      return JSON.parse(cleaned.slice(objStart, objEnd + 1));
    } catch {
      /* fall through */
    }
  }

  return null;
}

/**
 * Parses the model reply into typed recommendations. Falls back to a single
 * text recommendation when structured parsing yields nothing usable.
 */
export function parseRecommendations(raw: string): AiRecommendation[] {
  const parsed = extractJson(raw);
  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? [parsed]
      : null;

  if (candidates) {
    const items = candidates
      .map((candidate) => itemSchema.safeParse(candidate))
      .filter((result) => result.success)
      .map((result) => result.data as AiRecommendation)
      .slice(0, MAX_RECOMMENDATIONS);
    if (items.length > 0) return items;
  }

  // Fallback: surface the model's prose as one recommendation rather than error.
  const detail = raw.trim().slice(0, 600);
  if (!detail) return [];
  return [
    {
      title: "AI recommendation",
      detail,
      severity: "medium",
      category: "general",
      suggestedAction: "",
    },
  ];
}
