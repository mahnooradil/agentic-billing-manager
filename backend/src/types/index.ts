/**
 * Shared backend TypeScript types.
 * Domain models and API contracts are added here as phases land.
 */

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
}

/** Safe, password-free user shape returned to API clients. */
export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  profilePicture?: string;
  createdAt: Date;
  updatedAt: Date;
}
