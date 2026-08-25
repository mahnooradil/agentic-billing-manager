/**
 * Converts a Mongoose billing document into the shape returned to API clients.
 * Single source of truth for "what a billing record looks like on the wire".
 *
 * The `platform` reference is expected to be populated by the controller; a
 * minimal { id, name, slug } is embedded so clients can render it directly. A
 * defensive fallback is used if the referenced platform no longer exists.
 */
import type {
  BillingDocument,
  BillingSource,
  BillingStatus,
} from "@/models/billing.model";
import type { PlatformDocument } from "@/models/platform.model";
import type { PlatformConnectionDocument } from "@/models/platform-connection.model";

export interface PublicBillingPlatform {
  id: string;
  name: string;
  slug: string;
}

export interface PublicBilling {
  id: string;
  platform: PublicBillingPlatform;
  source: BillingSource;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  billingDate: Date;
  dueDate?: Date;
  status: BillingStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicBilling(billing: BillingDocument): PublicBilling {
  const platform = billing.platform as unknown as PlatformDocument | null;
  const connection =
    billing.platformConnection as unknown as PlatformConnectionDocument | null;

  const publicPlatform: PublicBillingPlatform = platform
    ? { id: platform._id.toString(), name: platform.name, slug: platform.slug }
    : connection
      ? {
          id: connection._id.toString(),
          // `vendorName` (set by email-sync's AI extraction — see
          // sync-engine.ts) is the ACTUAL vendor this bill is from (Netflix,
          // Spotify, ...) when it differs from the connection itself, e.g.
          // one Gmail inbox covering many vendors. Falls back to the
          // connection's own name for auto_sync (one connection = one
          // vendor there, so they're already the same).
          name: billing.vendorName ?? connection.displayName,
          slug: connection.platform,
        }
      : { id: "", name: "Unknown platform", slug: "" };

  return {
    id: billing._id.toString(),
    platform: publicPlatform,
    source: billing.source,
    customerName: billing.customerName,
    invoiceNumber: billing.invoiceNumber,
    amount: billing.amount,
    currency: billing.currency,
    billingDate: billing.billingDate,
    dueDate: billing.dueDate,
    status: billing.status,
    notes: billing.notes,
    createdAt: billing.createdAt,
    updatedAt: billing.updatedAt,
  };
}
