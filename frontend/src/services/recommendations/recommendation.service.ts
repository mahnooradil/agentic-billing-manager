/**
 * Recommendation service — reads the persistent recommendations and updates a
 * recommendation's lifecycle status. Goes through the shared authed `api` client
 * (Bearer token + central 401 handling). Generation is autonomous on the backend
 * — there is no "generate" call here by design.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  Recommendation,
  RecommendationsData,
  RecommendationStatus,
  RecommendationStatusFilter,
} from "@/services/types/recommendations";

/** GET /recommendations?status=… */
export function getRecommendations(
  status: RecommendationStatusFilter = "active"
): Promise<ApiSuccess<RecommendationsData>> {
  return api.get<ApiSuccess<RecommendationsData>>(
    `/recommendations?status=${encodeURIComponent(status)}`
  );
}

/** PATCH /recommendations/:id/status */
export function updateRecommendationStatus(
  id: string,
  status: RecommendationStatus
): Promise<ApiSuccess<{ recommendation: Recommendation }>> {
  return api.patch<ApiSuccess<{ recommendation: Recommendation }>>(
    `/recommendations/${id}/status`,
    { status }
  );
}
