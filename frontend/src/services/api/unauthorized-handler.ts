/**
 * Central registry for the "session is no longer valid" (401) reaction.
 *
 * The AuthProvider registers a handler (its `logout`) once; the API client
 * calls `notifyUnauthorized()` when an authenticated request is rejected with
 * 401. This keeps logout-on-401 logic in one place — components never do it.
 *
 * Kept dependency-free to avoid import cycles between the client and the
 * auth provider.
 */
type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  handler = fn;
}

export function notifyUnauthorized(): void {
  handler?.();
}
