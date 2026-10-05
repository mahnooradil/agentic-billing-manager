/**
 * Shared "is this connection due for its next sync?" logic — used by both
 * recurring schedulers (email-sync, billing-sync) so a per-connection
 * `syncIntervalMinutes` override (set from the Automation page) is honored
 * identically in both places, instead of two copies of the same math.
 */
import type { PlatformConnectionDocument } from "@/models/platform-connection.model";

/** Default cadence when a connection has no `syncIntervalMinutes` override —
 *  matches this feature's pre-existing hardcoded intervals exactly, so an
 *  unconfigured connection behaves exactly as it always has. */
export const DEFAULT_EMAIL_SYNC_INTERVAL_MINUTES = 60;
export const DEFAULT_BILLING_SYNC_INTERVAL_MINUTES = 360;

/** The interval this specific connection actually runs on. */
export function getEffectiveSyncIntervalMinutes(
  connection: Pick<PlatformConnectionDocument, "syncIntervalMinutes">,
  defaultMinutes: number
): number {
  return connection.syncIntervalMinutes ?? defaultMinutes;
}

/** True when enough time has passed since `lastSyncAt` (or it's never
 *  synced at all) for this connection's own effective interval. */
export function isSyncDue(
  connection: Pick<PlatformConnectionDocument, "syncIntervalMinutes" | "lastSyncAt">,
  defaultMinutes: number,
  now: Date = new Date()
): boolean {
  if (!connection.lastSyncAt) return true;
  const effectiveMs = getEffectiveSyncIntervalMinutes(connection, defaultMinutes) * 60_000;
  return now.getTime() - connection.lastSyncAt.getTime() >= effectiveMs;
}
