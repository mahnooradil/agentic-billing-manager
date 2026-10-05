/**
 * Vendor confirmation types — WP-5's "confirm detected vendors" onboarding
 * step (flow/08 §9). Dates arrive as ISO strings over JSON.
 */
/** flow/extra-02 Part A1 — self-reported usage frequency. "rarely" covers
 *  "rarely or never," the value that actually flags a cancel candidate. */
export type UtilityRating = "daily" | "occasionally" | "rarely";

export interface Vendor {
  id: string;
  name: string;
  domain?: string;
  confirmedAt?: string;
  rejectedAt?: string;
  utilityRating?: UtilityRating;
  utilityRatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** A vendor awaiting review, with a sample of its most recent Billing
 *  record so there's something to judge it by beyond a bare name. */
export interface PendingVendor extends Vendor {
  sampleBilling: {
    amount: number;
    currency: string;
    billingDate: string;
  } | null;
}

export interface PendingVendorsData {
  vendors: PendingVendor[];
}

/** flow/extra-02 Part A1 — a confirmed vendor due for a (re)rating, with the
 *  same sample-billing context as a pending vendor. */
export type VendorDueForRating = PendingVendor;

export interface VendorsDueForRatingData {
  vendors: VendorDueForRating[];
}

export interface VendorData {
  vendor: Vendor;
}
