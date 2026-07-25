/**
 * User settings service — typed wrappers over the per-user preferences endpoints
 * (Phase F7). Goes through the shared authenticated `api` client (Bearer token +
 * central 401 handling), mirroring the other domain services.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  UserSettingsData,
  UpdateUserSettingsPayload,
} from "@/services/types/settings";

/** GET /settings — the current user's preferences (always complete). */
export function getUserSettings(): Promise<ApiSuccess<UserSettingsData>> {
  return api.get<ApiSuccess<UserSettingsData>>("/settings");
}

/** PUT /settings — deep-merge and persist the provided groups. */
export function updateUserSettings(
  payload: UpdateUserSettingsPayload
): Promise<ApiSuccess<UserSettingsData>> {
  return api.put<ApiSuccess<UserSettingsData>>("/settings", payload);
}
