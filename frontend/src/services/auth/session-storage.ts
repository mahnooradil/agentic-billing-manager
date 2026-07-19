/**
 * Low-level session persistence in `localStorage`.
 *
 * Stores ONLY the JWT and a basic user object — never a password or any
 * sensitive backend data. Every read is defensive: corrupted JSON, a missing
 * user, an invalid shape, or an expired/malformed token all resolve to an
 * empty session (and the bad data is cleared), so callers never crash on
 * tampered or stale storage.
 */
import type { AuthUser } from "@/services/types/auth";

const TOKEN_KEY = "billing.auth.token";
const USER_KEY = "billing.auth.user";

export interface StoredSession {
  token: string | null;
  user: AuthUser | null;
}

const EMPTY_SESSION: StoredSession = { token: null, user: null };

/** Narrow unknown parsed JSON to a minimally-valid AuthUser. */
function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof user.fullName === "string"
  );
}

/** Decode a JWT's `exp` (seconds) without verifying the signature. */
function getTokenExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    base64 += "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** A token is treated as expired if it is malformed or past its `exp`. */
function isTokenExpired(token: string): boolean {
  const exp = getTokenExpiry(token);
  if (exp === null) return true;
  return Date.now() >= exp * 1000;
}

export function readStoredSession(): StoredSession {
  if (typeof window === "undefined") return EMPTY_SESSION;

  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const rawUser = window.localStorage.getItem(USER_KEY);

    if (!token || !rawUser || isTokenExpired(token)) {
      clearStoredSession();
      return EMPTY_SESSION;
    }

    const parsed: unknown = JSON.parse(rawUser);
    if (!isAuthUser(parsed)) {
      clearStoredSession();
      return EMPTY_SESSION;
    }

    return { token, user: parsed };
  } catch {
    clearStoredSession();
    return EMPTY_SESSION;
  }
}

export function writeStoredSession(token: string, user: AuthUser): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable / quota exceeded — fail silently, session stays in memory.
  }
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch {
    // Nothing actionable if storage is unavailable.
  }
}
