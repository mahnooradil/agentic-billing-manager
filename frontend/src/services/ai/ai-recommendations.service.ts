/**
 * AI recommendations service — asks the backend to turn the billing analytics
 * snapshot into AI-generated recommendations. Goes through the shared authed
 * `api` client (Bearer token + central 401 handling).
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  AiRecommendationsResult,
  GenerateRecommendationsPayload,
} from "@/services/types/ai-recommendations";

/** POST /ai/recommendations */
export function generateRecommendations(
  payload: GenerateRecommendationsPayload
): Promise<ApiSuccess<AiRecommendationsResult>> {
  return api.post<ApiSuccess<AiRecommendationsResult>>(
    "/ai/recommendations",
    payload
  );
}
