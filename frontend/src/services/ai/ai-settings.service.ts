/**
 * AI settings service — typed wrappers over the per-user AI configuration
 * endpoints. Goes through the shared authenticated `api` client (Bearer token +
 * central 401 handling), so there is no duplicated fetch logic here.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  AiSettingsData,
  UpsertAiSettingsPayload,
} from "@/services/types/ai";

/** GET /ai/settings */
export function getAiSettings(): Promise<ApiSuccess<AiSettingsData>> {
  return api.get<ApiSuccess<AiSettingsData>>("/ai/settings");
}

/** PUT /ai/settings — create or update the current user's configuration. */
export function upsertAiSettings(
  payload: UpsertAiSettingsPayload
): Promise<ApiSuccess<AiSettingsData>> {
  return api.put<ApiSuccess<AiSettingsData>>("/ai/settings", payload);
}

/** DELETE /ai/settings */
export function deleteAiSettings(): Promise<ApiSuccess<{ id: string }>> {
  return api.delete<ApiSuccess<{ id: string }>>("/ai/settings");
}
