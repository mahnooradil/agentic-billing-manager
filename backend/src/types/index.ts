/**
 * Shared backend TypeScript types.
 * Domain models and API contracts will be added here in later phases.
 */

/** Standard JSON shape returned by the API for successful responses. */
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
}

/** Standard JSON shape returned by the API for errors. */
export interface ApiError {
  success: false;
  message: string;
}
