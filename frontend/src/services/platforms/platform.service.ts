/**
 * Platform service — typed wrappers over the backend CRUD endpoints. Every call
 * goes through the shared authenticated `api` client (Bearer token + central
 * 401 handling), so there is no duplicated fetch logic here.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  CreatePlatformPayload,
  PlatformData,
  PlatformDeletedData,
  PlatformListData,
  UpdatePlatformPayload,
} from "@/services/types/platform";

/** GET /platforms */
export function listPlatforms(): Promise<ApiSuccess<PlatformListData>> {
  return api.get<ApiSuccess<PlatformListData>>("/platforms");
}

/** GET /platforms/:id */
export function getPlatform(id: string): Promise<ApiSuccess<PlatformData>> {
  return api.get<ApiSuccess<PlatformData>>(`/platforms/${id}`);
}

/** POST /platforms */
export function createPlatform(
  payload: CreatePlatformPayload
): Promise<ApiSuccess<PlatformData>> {
  return api.post<ApiSuccess<PlatformData>>("/platforms", payload);
}

/** PUT /platforms/:id */
export function updatePlatform(
  id: string,
  payload: UpdatePlatformPayload
): Promise<ApiSuccess<PlatformData>> {
  return api.put<ApiSuccess<PlatformData>>(`/platforms/${id}`, payload);
}

/** DELETE /platforms/:id */
export function deletePlatform(
  id: string
): Promise<ApiSuccess<PlatformDeletedData>> {
  return api.delete<ApiSuccess<PlatformDeletedData>>(`/platforms/${id}`);
}
