/**
 * Recommendation serializer — Phase F1. Single source of truth for the wire
 * shape of a persisted recommendation.
 */
import type {
  RecommendationDocument,
  RecommendationSeverity,
  RecommendationStatus,
  RecommendationSource,
  RecommendationResolver,
} from "@/models/recommendation.model";

export interface PublicRecommendation {
  id: string;
  title: string;
  detail: string;
  severity: RecommendationSeverity;
  category: string;
  suggestedAction: string;
  source: RecommendationSource;
  status: RecommendationStatus;
  resolvedBy: RecommendationResolver | null;
  generatedAt: Date;
  updatedAt: Date;
}

export function toPublicRecommendation(
  doc: RecommendationDocument
): PublicRecommendation {
  return {
    id: doc._id.toString(),
    title: doc.title,
    detail: doc.detail,
    severity: doc.severity,
    category: doc.category,
    suggestedAction: doc.suggestedAction,
    source: doc.source,
    status: doc.status,
    resolvedBy: doc.resolvedBy,
    generatedAt: doc.generatedAt,
    updatedAt: doc.updatedAt,
  };
}
