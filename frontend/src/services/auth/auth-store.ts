/**
 * Framework-agnostic auth store backing the React context via
 * `useSyncExternalStore`. Using an external store (instead of state + effects)
 * gives flicker-free hydration and sidesteps set-state-in-effect entirely.
 *
 * Lifecycle:
 *  - Starts in `loading` with an empty session (matches the server snapshot).
 *  - On first subscribe (client only) it reads/validates persisted storage
 *    once and transitions to `ready`.
 *  - `setSession` / `clearSession` persist and broadcast to subscribers.
 */
import type { AuthUser } from "@/services/types/auth";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./session-storage";

export type AuthStatus = "loading" | "ready";

export interface AuthSnapshot {
  token: string | null;
  user: AuthUser | null;
  status: AuthStatus;
}

// Stable references so getSnapshot/getServerSnapshot stay referentially equal.
const LOADING_SNAPSHOT: AuthSnapshot = {
  token: null,
  user: null,
  status: "loading",
};

let snapshot: AuthSnapshot = LOADING_SNAPSHOT;
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: AuthSnapshot): void {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Hydrate exactly once, on the client, when the first consumer mounts.
  if (!hydrated) {
    hydrated = true;
    const restored = readStoredSession();
    snapshot = { token: restored.token, user: restored.user, status: "ready" };
    emit();
  }

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthSnapshot {
  return snapshot;
}

function getServerSnapshot(): AuthSnapshot {
  return LOADING_SNAPSHOT;
}

/**
 * Current JWT for outgoing authenticated requests. Reads the in-memory
 * snapshot once hydrated; before that (edge case) it falls back to storage.
 * This is the ONLY place the API client should source the token.
 */
function getToken(): string | null {
  return snapshot.status === "ready" ? snapshot.token : readStoredSession().token;
}

function setSession(token: string, user: AuthUser): void {
  writeStoredSession(token, user);
  setSnapshot({ token, user, status: "ready" });
}

function clearSession(): void {
  clearStoredSession();
  setSnapshot({ token: null, user: null, status: "ready" });
}

export const authStore = {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  getToken,
  setSession,
  clearSession,
};
