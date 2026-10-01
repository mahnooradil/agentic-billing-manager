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
import type { VendorDocument } from "@/models/vendor.model";

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
  /** WP-5 (CLAUDE.md Sec10.5 "no trust UX") — set whenever a human edits
   *  this record directly (Billing page or the agent's confirm button). See
   *  billing.model.ts's own docstring for the full reasoning. */
  manuallyEditedAt?: Date;
  /** Provenance trail — populated for email_sync records only. See
   *  billing.model.ts's IBilling for the full reasoning per field. */
  sourceMessageId?: string;
  sourceThreadId?: string;
  senderEmail?: string;
  senderDomain?: string;
  receivedAt?: Date;
  subject?: string;
  extractionConfidence?: number;
  extractionModel?: string;
  extractedAt?: Date;
  evidence?: string[];
  senderAuthResult?: "pass" | "fail" | "none";
  senderReplyToMismatch?: boolean;
  /** The resolved real-vendor identity (Task 7) — set only for auto_sync/
   *  email_sync records whose vendor has been resolved (new records always;
   *  legacy ones once the backfill migration has run). Null otherwise. */
  vendor?: { id: string; name: string; domain?: string } | null;
  /** Task 8 — an independent status computed from this record's full event
   *  history, dual-written alongside `status` for comparison. Read-only,
   *  not consumed by any UI yet — see billing.model.ts's own docstring. */
  derivedStatus?: string;
  derivedStatusConfidence?: number;
  derivedStatusBasis?: string;
  derivedStatusExplanation?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicBilling(billing: BillingDocument): PublicBilling {
  const platform = billing.platform as unknown as PlatformDocument | null;
  const connection =
    billing.platformConnection as unknown as PlatformConnectionDocument | null;
  const vendorDoc =
    billing.vendor && typeof billing.vendor === "object" && "name" in billing.vendor
      ? (billing.vendor as unknown as VendorDocument)
      : null;

  const publicPlatform: PublicBillingPlatform = platform
    ? { id: platform._id.toString(), name: platform.name, slug: platform.slug }
    : connection
      ? {
          id: connection._id.toString(),
          // Prefer the resolved Vendor's name (Task 7) — the canonical,
          // self-correcting identity shared across every connection for the
          // same real vendor. Falls back to the older per-record `vendorName`
          // (set by email-sync's AI extraction) for a record not yet covered
          // by the vendor backfill, then the connection's own name (one
          // connection = one vendor for auto_sync, so already the same).
          name: vendorDoc?.name ?? billing.vendorName ?? connection.displayName,
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
    manuallyEditedAt: billing.manuallyEditedAt,
    sourceMessageId: billing.sourceMessageId,
    sourceThreadId: billing.sourceThreadId,
    senderEmail: billing.senderEmail,
    senderDomain: billing.senderDomain,
    receivedAt: billing.receivedAt,
    subject: billing.subject,
    extractionConfidence: billing.extractionConfidence,
    extractionModel: billing.extractionModel,
    extractedAt: billing.extractedAt,
    evidence: billing.evidence,
    senderAuthResult: billing.senderAuthResult,
    senderReplyToMismatch: billing.senderReplyToMismatch,
    vendor: vendorDoc
      ? { id: vendorDoc._id.toString(), name: vendorDoc.name, domain: vendorDoc.domain }
      : null,
    derivedStatus: billing.derivedStatus,
    derivedStatusConfidence: billing.derivedStatusConfidence,
    derivedStatusBasis: billing.derivedStatusBasis,
    derivedStatusExplanation: billing.derivedStatusExplanation,
    createdAt: billing.createdAt,
    updatedAt: billing.updatedAt,
  };
}
