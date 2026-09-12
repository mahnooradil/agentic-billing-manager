/**
 * Short-lived, in-process cache for `authenticate`'s resolved auth context
 * (User + Membership + Organization) — a real measurement on this app's own
 * MongoDB Atlas cluster found each round trip costs tens of milliseconds, and
 * a single page load routinely fires several parallel API calls (e.g. the
 * Billing view's records + stats + platforms) that each re-run the SAME
 * lookups for the SAME user within a few hundred milliseconds of each other.
 * Caching lets every request after the first in that burst skip straight to
 * its own endpoint query.
 *
 * Deliberately in-memory, not Redis: this app runs as a single Railway
 * instance, so there's no cross-instance consistency problem to solve, and
 * introducing a whole new datastore for a 5-second cache would be over-
 * engineering. Would need revisiting if this ever scales to multiple
 * instances.
 *
 * Trade-off, accepted explicitly rather than silently: a token invalidated
 * via `signOutEverywhere`/`revokeSession` (or an org switched via
 * `switchOrganization`) can still be served from a stale cache entry for up
 * to `CACHE_TTL_MS`. Every one of those mutations calls `invalidateCachedAuth`
 * below to close that window immediately for the common case (the user's own
 * action) — the TTL alone is the fallback for the rarer case (revoked from
 * ANOTHER device/session).
 */
import type { UserDocument } from "@/models/user.model";
import type { MembershipDocument } from "@/models/membership.model";
import type { OrganizationDocument } from "@/models/organization.model";

const CACHE_TTL_MS = 5_000;

export interface CachedAuthContext {
  user: UserDocument;
  membership: MembershipDocument;
  organization: OrganizationDocument;
}

interface CacheEntry {
  value: CachedAuthContext;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, jti: string | undefined): string {
  return `${userId}:${jti ?? "nojti"}`;
}

/** Returns the cached context for this exact (user, session) pair, or null
 *  on a miss/expiry. Callers must still treat this as fully resolved — no
 *  further DB checks needed on a hit. */
export function getCachedAuth(
  userId: string,
  jti: string | undefined
): CachedAuthContext | null {
  const key = cacheKey(userId, jti);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

/** Stores a freshly-resolved auth context, only ever called AFTER every
 *  check (signature, tokenVersion, session revocation) has already passed —
 *  a cache entry is never itself the source of a security decision. */
export function setCachedAuth(
  userId: string,
  jti: string | undefined,
  value: CachedAuthContext
): void {
  cache.set(cacheKey(userId, jti), { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Drops every cached entry for this user (across all of their sessions/jtis
 *  — the jti isn't known at every call site, e.g. sign-out-everywhere acts on
 *  OTHER devices' sessions). Call this from any mutation that changes what a
 *  cached entry would answer: org switch, sign-out-everywhere, single-session
 *  revoke, profile update, account deletion. */
export function invalidateCachedAuth(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
