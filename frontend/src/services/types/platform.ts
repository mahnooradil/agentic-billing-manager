/**
 * Platform domain types shared between the service layer and the UI.
 * Dates arrive as ISO strings over JSON.
 */
export type PlatformStatus = "Active" | "Inactive";

export interface Platform {
  id: string;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  logo?: string;
  status: PlatformStatus;
  createdAt: string;
  updatedAt: string;
}

/** Request payload for creating a platform. */
export interface CreatePlatformPayload {
  name: string;
  slug: string;
  description?: string;
  website?: string;
  logo?: string;
  status?: PlatformStatus;
}

/** Request payload for updating a platform (any subset). */
export type UpdatePlatformPayload = Partial<CreatePlatformPayload>;

/** Response `data` shapes returned by the platform endpoints. */
export interface PlatformListData {
  platforms: Platform[];
}

export interface PlatformData {
  platform: Platform;
}

export interface PlatformDeletedData {
  id: string;
}
