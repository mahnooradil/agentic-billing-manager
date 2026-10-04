/**
 * Vendor confirmation types — WP-5's "confirm detected vendors" onboarding
 * step (flow/08 §9). Dates arrive as ISO strings over JSON.
 */
export interface Vendor {
  id: string;
  name: string;
  domain?: string;
  confirmedAt?: string;
  rejectedAt?: string;
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

export interface VendorData {
  vendor: Vendor;
}
