/**
 * Email-sync platform registry — which connected platforms are treated as an
 * email-based fallback billing source (see services/email-sync/sync-engine.ts).
 * Structured as a list (mirrors services/billing-sync/registry.ts's shape) so a
 * future Outlook/IMAP channel can be added without redesigning the call sites.
 */

/** Pipedream `nameSlug`s this app scans for invoice emails instead of an API pull. */
export const EMAIL_SYNC_PLATFORMS = ["gmail"] as const;

/** Normalizes a Pipedream nameSlug for comparison (case/dash/underscore-insensitive). */
function normalize(slug: string): string {
  return slug.trim().toLowerCase().replace(/[-_]/g, "");
}

/** True when this connection's platform is a supported email-sync source. */
export function isEmailSyncPlatform(platform: string): boolean {
  const target = normalize(platform);
  return EMAIL_SYNC_PLATFORMS.some((p) => normalize(p) === target);
}
