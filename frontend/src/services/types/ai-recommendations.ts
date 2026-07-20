/**
 * AI recommendations types shared between the service layer and the UI.
 * Mirror the backend `/ai/recommendations` response contract (Phase 10).
 */
import type { AnalyticsRange } from "@/services/types/analytics";

export type RecommendationSeverity = "low" | "medium" | "high";

export const RECOMMENDATION_FOCUSES = ["all", "overdue", "spend"] as const;
export type RecommendationFocus = (typeof RECOMMENDATION_FOCUSES)[number];

export interface AiRecommendation {
  title: string;
  detail: string;
  severity: RecommendationSeverity;
  category: string;
  suggestedAction: string;
}

export interface AiRecommendationsResult {
  recommendations: AiRecommendation[];
  provider: string;
  model: string;
  generatedAt: string;
  dataAvailable: boolean;
}

/** Request payload for generating recommendations. */
export interface GenerateRecommendationsPayload {
  range: AnalyticsRange;
  focus: RecommendationFocus;
}
