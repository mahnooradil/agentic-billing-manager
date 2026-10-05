/**
 * Converts a Mongoose Vendor document into the shape returned to API
 * clients. Single source of truth for "what a vendor looks like on the
 * wire" — mirrors billing.serializer.ts's own convention.
 */
import type { UtilityRating, VendorDocument } from "@/models/vendor.model";

export interface PublicVendor {
  id: string;
  name: string;
  domain?: string;
  confirmedAt?: Date;
  rejectedAt?: Date;
  utilityRating?: UtilityRating;
  utilityRatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicVendor(vendor: VendorDocument): PublicVendor {
  return {
    id: vendor._id.toString(),
    name: vendor.name,
    domain: vendor.domain,
    confirmedAt: vendor.confirmedAt,
    rejectedAt: vendor.rejectedAt,
    utilityRating: vendor.utilityRating,
    utilityRatedAt: vendor.utilityRatedAt,
    createdAt: vendor.createdAt,
    updatedAt: vendor.updatedAt,
  };
}

/** A vendor awaiting the "confirm detected vendors" review, with a sample
 *  of its most recent Billing record so the user has something to judge it
 *  by (not just a bare name). */
export interface PublicPendingVendor extends PublicVendor {
  sampleBilling: {
    amount: number;
    currency: string;
    billingDate: Date;
  } | null;
}

/** flow/extra-02 Part A1 — a confirmed vendor due for a (re)rating, with the
 *  same sample-billing context as a pending vendor so the user remembers
 *  what this actually is before answering. */
export type PublicVendorDueForRating = PublicPendingVendor;
