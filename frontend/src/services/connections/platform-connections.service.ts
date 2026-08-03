/**
 * Platform connections service — typed wrappers over the F8 endpoints, through
 * the shared authenticated `api` client (Bearer token + central 401 handling).
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  CreatePlatformConnectionPayload,
  PlatformConnectionData,
  PlatformConnectionDeletedData,
  PlatformConnectionsData,
  UpdatePlatformConnectionPayload,
  VerifyPlatformConnectionPayload,
  PipedreamCatalogData,
  PipedreamConnectTokenData,
  ConnectViaPipedreamPayload,
} from "@/services/types/platform-connections";

/** GET /platform-connections */
export function listPlatformConnections(): Promise<
  ApiSuccess<PlatformConnectionsData>
> {
  return api.get<ApiSuccess<PlatformConnectionsData>>("/platform-connections");
}

/** POST /platform-connections */
export function createPlatformConnection(
  payload: CreatePlatformConnectionPayload
): Promise<ApiSuccess<PlatformConnectionData>> {
  return api.post<ApiSuccess<PlatformConnectionData>>(
    "/platform-connections",
    payload
  );
}

/** POST /platform-connections/:id/verify — verify or reconnect (with a new key). */
export function verifyPlatformConnection(
  id: string,
  payload: VerifyPlatformConnectionPayload = {}
): Promise<ApiSuccess<PlatformConnectionData>> {
  return api.post<ApiSuccess<PlatformConnectionData>>(
    `/platform-connections/${id}/verify`,
    payload
  );
}

/** PATCH /platform-connections/:id */
export function updatePlatformConnection(
  id: string,
  payload: UpdatePlatformConnectionPayload
): Promise<ApiSuccess<PlatformConnectionData>> {
  return api.patch<ApiSuccess<PlatformConnectionData>>(
    `/platform-connections/${id}`,
    payload
  );
}

/** GET /platform-connections/catalog?q=&limit= — live Pipedream app catalog. */
export function getPipedreamCatalog(
  query: string,
  limit?: number
): Promise<ApiSuccess<PipedreamCatalogData>> {
  const params = new URLSearchParams({ q: query });
  if (limit) params.set("limit", String(limit));
  return api.get<ApiSuccess<PipedreamCatalogData>>(
    `/platform-connections/catalog?${params.toString()}`
  );
}

/** POST /platform-connections/connect-token — mint a Pipedream Connect token. */
export function createPipedreamConnectToken(): Promise<
  ApiSuccess<PipedreamConnectTokenData>
> {
  return api.post<ApiSuccess<PipedreamConnectTokenData>>(
    "/platform-connections/connect-token",
    {}
  );
}

/** POST /platform-connections/pipedream — finalize a Pipedream-managed connection. */
export function connectViaPipedream(
  payload: ConnectViaPipedreamPayload
): Promise<ApiSuccess<PlatformConnectionData>> {
  return api.post<ApiSuccess<PlatformConnectionData>>(
    "/platform-connections/pipedream",
    payload
  );
}

/** DELETE /platform-connections/:id */
export function deletePlatformConnection(
  id: string
): Promise<ApiSuccess<PlatformConnectionDeletedData>> {
  return api.delete<ApiSuccess<PlatformConnectionDeletedData>>(
    `/platform-connections/${id}`
  );
}
