/**
 * Determines the vendor identity a LEGACY (pre-Task-7) `auto_sync`/
 * `email_sync` Billing record should resolve to — the exact same derivation
 * both sync engines use going forward, applied retroactively. Extracted as
 * its own pure-ish function (no DB writes) so `scripts/backfill-vendors.ts`
 * and its test can share and verify the identical logic.
 */
import type { Types } from "mongoose";

export interface LegacyBillingRecord {
  source: "auto_sync" | "email_sync";
  platformConnection?: Types.ObjectId | string | null;
  vendorName?: string | null;
  customerName: string;
  senderDomain?: string | null;
}

export interface LegacyVendorIdentity {
  name: string;
  domain?: string;
}

/**
 * Resolves the {name, domain} a legacy record's vendor should be looked up
 * by. Returns null when there is genuinely nothing to resolve from (no
 * usable name for email_sync, or no connection reference for auto_sync) —
 * callers should skip, not guess, in that case.
 *
 * `lookupConnectionName` is injected (rather than importing PlatformConnection
 * directly here) so this stays a pure function in tests — no live database
 * needed to verify the derivation itself.
 */
export async function legacyBillingVendorIdentity(
  record: LegacyBillingRecord,
  lookupConnectionName: (connectionId: string) => Promise<string | null>
): Promise<LegacyVendorIdentity | null> {
  if (record.source === "email_sync") {
    const name = record.vendorName?.trim() || record.customerName?.trim();
    if (!name) return null;
    return { name, domain: record.senderDomain?.trim() || undefined };
  }

  // auto_sync — the connection's own displayName IS the vendor name (see
  // billing-sync/sync-engine.ts).
  const connectionId = record.platformConnection?.toString();
  if (!connectionId) return null;
  const name = await lookupConnectionName(connectionId);
  if (!name) return null;
  return { name };
}
