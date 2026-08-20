/**
 * Shared backend TypeScript types.
 * Domain models and API contracts are added here as phases land.
 */
import type { PlanTier } from "@/config/plans";

/** Standard JSON shape returned by the API for successful responses. */
export interface ApiResponse<T = unknown> {
  success: true;
  /** Human-readable outcome message (optional for backward compatibility). */
  message?: string;
  data: T;
}

/** Standard JSON shape returned by the API for errors. */
export interface ApiError {
  success: false;
  message: string;
  /** Optional list of field-level validation messages. */
  errors?: string[];
}

/** Payload embedded in a signed JWT. Kept intentionally minimal. */
export interface TokenPayload {
  /** The user's MongoDB id (stringified ObjectId). */
  id: string;
  /** Must match the user's current `tokenVersion` — "sign out everywhere"
   *  bumps it, instantly invalidating every token signed before that. Optional
   *  for backward compatibility with tokens issued before this field existed
   *  (treated as `0`, the default). */
  tokenVersion?: number;
  /** Links this token to its `Session` document (Security tab / per-device
   *  revocation). Optional for backward compatibility with tokens issued
   *  before session tracking existed — those simply skip the session check. */
  jti?: string;
}

/** Safe, password-free user shape returned to API clients. `planTier` moved
 *  to the organization — see `PublicOrganization` (GET /api/organization). */
export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  profilePicture?: string;
  creditsBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

/** The current user's organization + their role in it. */
export interface PublicOrganization {
  id: string;
  name: string;
  planTier: PlanTier;
  role: "owner" | "admin" | "member";
  createdAt: Date;
  updatedAt: Date;
}
