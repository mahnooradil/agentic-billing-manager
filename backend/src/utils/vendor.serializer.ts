/**
 * Converts a Mongoose Vendor document into the shape returned to API
 * clients. Single source of truth for "what a vendor looks like on the
 * wire" — mirrors billing.serializer.ts's own convention.
 */
import type { VendorDocument } from "@/models/vendor.model";

export interface PublicVendor {
  id: string;
  name: string;
  domain?: string;
  confirmedAt?: Date;
  rejectedAt?: Date;
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
