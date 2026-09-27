/**
 * Resolves a real Vendor identity for a synced Billing record — shared by
 * both sync engines (email-sync and billing-sync) and the vendor-backfill
 * migration script, so all three ever create/match a Vendor exactly the
 * same way. See vendor.model.ts for why this identity exists at all.
 */
import { Vendor, type VendorDocument } from "@/models/vendor.model";
import type { Types } from "mongoose";

export interface VendorIdentity {
  /** Display name — always required, even when a domain is also known. */
  name: string;
  /** Lowercased sending domain, when known (email-derived vendors only). */
  domain?: string | null;
}

/**
 * Upserts and returns the Vendor matching this identity — by domain when
 * one is given (the reliable key), else by a case-insensitive-normalized
 * name within the organization (billing-sync adapters have no domain to key
 * on). `name` is refreshed on every call (`$set`), so the vendor's display
 * name self-corrects toward whatever the most recent sync actually observed
 * rather than freezing on the first-ever value.
 */
export async function resolveVendor(
  organizationId: Types.ObjectId,
  identity: VendorIdentity
): Promise<VendorDocument> {
  const domain = identity.domain?.trim().toLowerCase() || undefined;
  // A single always-present key the unique index is built on — see
  // vendor.model.ts's `dedupeKey` docstring for why this replaces two
  // partial-filter indexes (MongoDB can't express "field does not exist" in
  // a partialFilterExpression). "name:"-prefixed for the domain-less branch
  // so a name that happens to look like a domain string can never collide
  // with a real domain's key.
  const dedupeKey = domain ?? `name:${identity.name.trim().toLowerCase()}`;

  return Vendor.findOneAndUpdate(
    { organization: organizationId, dedupeKey },
    { $set: { name: identity.name, dedupeKey, ...(domain ? { domain } : {}) } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}
