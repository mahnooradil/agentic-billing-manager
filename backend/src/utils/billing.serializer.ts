/**
 * Converts a Mongoose billing document into the shape returned to API clients.
 * Single source of truth for "what a billing record looks like on the wire".
 *
 * The `platform` reference is expected to be populated by the controller; a
 * minimal { id, name, slug } is embedded so clients can render it directly. A
 * defensive fallback is used if the referenced platform no longer exists.
 */
import type { BillingDocument, BillingStatus } from "@/models/billing.model";
import type { PlatformDocument } from "@/models/platform.model";

export interface PublicBillingPlatform {
  id: string;
  name: string;
  slug: string;
}

export interface PublicBilling {
  id: string;
  platform: PublicBillingPlatform;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  billingDate: Date;
  status: BillingStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicBilling(billing: BillingDocument): PublicBilling {
  const platform = billing.platform as unknown as PlatformDocument | null;

  return {
    id: billing._id.toString(),
    platform: platform
      ? {
          id: platform._id.toString(),
          name: platform.name,
          slug: platform.slug,
        }
      : { id: "", name: "Unknown platform", slug: "" },
    customerName: billing.customerName,
    invoiceNumber: billing.invoiceNumber,
    amount: billing.amount,
    currency: billing.currency,
    billingDate: billing.billingDate,
    status: billing.status,
    notes: billing.notes,
    createdAt: billing.createdAt,
    updatedAt: billing.updatedAt,
  };
}
