/**
 * Persistent recommendation types (Phase F1). Mirror the backend
 * `/api/recommendations` contract. Recommendations are now durable workspace
 * data with a lifecycle, not ephemeral AI responses.
 */
export type RecommendationSeverity = "low" | "medium" | "high";
export type RecommendationStatus = "active" | "dismissed" | "completed";
export type RecommendationSource = "auto" | "manual";
export type RecommendationResolver = "ai" | "user" | null;

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  severity: RecommendationSeverity;
  category: string;
  suggestedAction: string;
  source: RecommendationSource;
  status: RecommendationStatus;
  resolvedBy: RecommendationResolver;
  generatedAt: string;
  updatedAt: string;
}

/** The `status` filter accepted by the list endpoint. */
export type RecommendationStatusFilter = RecommendationStatus | "all";

export interface RecommendationsMeta {
  status: RecommendationStatusFilter;
  count: number;
  lastUpdatedAt: string | null;
}

/** Response `data` shape for GET /api/recommendations. */
export interface RecommendationsData {
  recommendations: Recommendation[];
  meta: RecommendationsMeta;
}
