/**
 * Builds the AI recommendations prompt from an analytics snapshot (Phase 10).
 *
 * PRIVACY: only AGGREGATED analytics are included — per-currency totals, platform
 * names + summed spend, status counts, monthly trend, and the rule-based insight
 * strings. No customer names, invoice numbers, notes, or raw billing records are
 * ever placed in the prompt. This both limits data sent to the third-party LLM
 * and removes the prompt-injection vector of adversarial text in a customer note.
 */
import type { PublicAnalyticsOverview } from "@/utils/analytics.serializer";

/** Recommendation focus areas. Kept here since this is the sole consumer. */
export const RECOMMENDATION_FOCUSES = ["all", "overdue", "spend"] as const;
export type RecommendationFocus = (typeof RECOMMENDATION_FOCUSES)[number];

const FOCUS_INSTRUCTION: Record<RecommendationFocus, string> = {
  all: "Cover collections, cash flow, and cost/spend concentration.",
  overdue: "Focus primarily on overdue invoices and collecting outstanding amounts.",
  spend: "Focus primarily on spend concentration and cost optimization across platforms.",
};

/** Compact, PII-free snapshot of the analytics for the model to reason over. */
function toSnapshot(overview: PublicAnalyticsOverview) {
  return {
    range: overview.range,
    invoiceCount: overview.invoiceCount,
    primaryCurrency: overview.primaryCurrency,
    totalsByCurrency: overview.totalsByCurrency,
    statusCounts: overview.byStatus,
    spendByPlatform: overview.byPlatform.map((p) => ({
      platform: p.name,
      currency: p.currency,
      total: p.total,
      invoices: p.count,
    })),
    monthlyTrend: overview.monthlyTrend,
    ruleBasedInsights: overview.insights.map((i) => i.message),
  };
}

/**
 * Produces the single user-role prompt. Asks for a strict JSON array so the reply
 * is machine-parseable; the serializer still parses defensively in case the model
 * adds prose.
 */
export function buildRecommendationsPrompt(
  overview: PublicAnalyticsOverview,
  focus: RecommendationFocus
): string {
  const snapshot = JSON.stringify(toSnapshot(overview), null, 2);

  return [
    "You are a billing and revenue analyst for a SaaS billing manager.",
    "Analyze the following AGGREGATED billing analytics (no personal or raw invoice data is provided) and produce concise, actionable recommendations.",
    FOCUS_INSTRUCTION[focus],
    "",
    "Analytics snapshot (JSON):",
    snapshot,
    "",
    "Respond with ONLY a JSON array (no markdown, no commentary) of 3 to 6 objects.",
    "Each object must have exactly these string fields:",
    '- "title": a short headline, MAX 8 words. No sub-clauses, no "and" chaining multiple ideas.',
    '- "detail": EXACTLY ONE short sentence (max ~20 words) referencing the numbers. Not two sentences, not a paragraph.',
    '- "severity": one of "low", "medium", or "high"',
    '- "category": a short label such as "collections", "cash-flow", "cost", or "general"',
    '- "suggestedAction": a concrete next step, MAX 10 words, phrased as an imperative (e.g. "Email the 3 overdue accounts today").',
    "",
    "Be terse. A user should read all 6 recommendations in under 20 seconds. Do not explain your reasoning, do not restate the analytics, do not hedge — just the finding and the action.",
    "All monetary figures are already per-currency; never invent data not present in the snapshot.",
    "",
    "Example of the right length (do not copy the content, only the brevity):",
    '{"title": "Netflix invoices piling up", "detail": "3 Netflix invoices totaling $87 are overdue by 12+ days.", "severity": "medium", "category": "collections", "suggestedAction": "Follow up on the 3 overdue Netflix invoices."}',
  ].join("\n");
}
