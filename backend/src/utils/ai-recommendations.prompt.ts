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
import type { RecommendationFocus } from "@/validators/ai-recommendations.validator";

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
    '- "title": a short headline (max ~12 words)',
    '- "detail": one or two sentences explaining the recommendation, referencing the numbers',
    '- "severity": one of "low", "medium", or "high"',
    '- "category": a short label such as "collections", "cash-flow", "cost", or "general"',
    '- "suggestedAction": a concrete next step the user could take',
    "",
    "All monetary figures are already per-currency; never invent data not present in the snapshot.",
  ].join("\n");
}
