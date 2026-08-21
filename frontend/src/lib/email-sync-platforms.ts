/**
 * Mirrors the backend's email-sync platform registry
 * (backend/src/services/email-sync/registry.ts) so the frontend can tell
 * which connections are "email accounts" (Gmail/Outlook, scanned for invoice
 * emails as a fallback behind direct billing sync) without a round trip.
 * Keep this list in sync with the backend's `EMAIL_SYNC_PLATFORMS` by hand —
 * there's no shared package between the two apps.
 */
export const EMAIL_SYNC_APPS = [
  { nameSlug: "gmail", name: "Gmail" },
  { nameSlug: "microsoft_outlook", name: "Microsoft Outlook Email" },
] as const;

/** Case/dash/underscore-insensitive, matching the backend's own `normalize`. */
function normalize(slug: string): string {
  return slug.trim().toLowerCase().replace(/[-_]/g, "");
}

export function isEmailSyncPlatform(platform: string): boolean {
  const target = normalize(platform);
  return EMAIL_SYNC_APPS.some((app) => normalize(app.nameSlug) === target);
}

/** Human-readable provider name for a connection's `platform` slug. */
export function emailSyncProviderLabel(platform: string): string {
  const target = normalize(platform);
  return EMAIL_SYNC_APPS.find((app) => normalize(app.nameSlug) === target)?.name ?? platform;
}

/** Reads the sync-engine's own watermark (backend/src/services/email-sync/
 *  sync-engine.ts sets `metadata.emailSync.lastSyncedAt` after each run). */
export function lastEmailSyncedAt(metadata: Record<string, unknown>): Date | null {
  const emailSync = metadata.emailSync as { lastSyncedAt?: string } | undefined;
  if (!emailSync?.lastSyncedAt) return null;
  const date = new Date(emailSync.lastSyncedAt);
  return isNaN(date.getTime()) ? null : date;
}

/** Coarse "time ago" label — good enough for a status hint, not a live clock. */
export function timeAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
