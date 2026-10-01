/**
 * Billing domain types shared between the service layer and the UI.
 * Dates arrive as ISO strings over JSON.
 */
export type BillingStatus = "Pending" | "Paid" | "Overdue";

/** How a billing record was created. For "auto_sync"/"email_sync" records,
 *  `platform.id`/`platform.slug` below actually identify the *connection*
 *  (PlatformConnection) it came through, not a `Platform` document — see
 *  `backend/src/utils/billing.serializer.ts`. */
export type BillingSource = "manual" | "auto_sync" | "email_sync";

/** Minimal platform reference embedded in a billing record. */
export interface BillingPlatformRef {
  id: string;
  name: string;
  slug: string;
  /** The connected inbox's own email address (email_sync only) — see
   *  `backend/src/utils/billing.serializer.ts` for why this is distinct
   *  from `senderEmail`. */
  accountIdentifier?: string;
}

/** The real vendor identity (Task 7), when resolved. */
export interface BillingVendorRef {
  id: string;
  name: string;
  domain?: string;
}

export interface BillingRecord {
  id: string;
  platform: BillingPlatformRef;
  source: BillingSource;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  billingDate: string;
  /** Only ever populated for auto_sync/email_sync records whose source
   *  actually states one — a manual record generally has none. */
  dueDate?: string;
  status: BillingStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;

  /** WP-5 (CLAUDE.md Sec10.5 "no trust UX") — provenance fields, all already
   *  sent by the backend (`billing.serializer.ts`) but never surfaced in any
   *  UI before this. Populated only for the source they're relevant to —
   *  see billing.model.ts's own docstring for the full per-field reasoning. */
  manuallyEditedAt?: string;
  sourceMessageId?: string;
  sourceThreadId?: string;
  senderEmail?: string;
  senderDomain?: string;
  receivedAt?: string;
  subject?: string;
  extractionConfidence?: number;
  extractionModel?: string;
  extractedAt?: string;
  evidence?: string[];
  senderAuthResult?: "pass" | "fail" | "none";
  senderReplyToMismatch?: boolean;
  vendor?: BillingVendorRef | null;
  derivedStatus?: string;
  derivedStatusConfidence?: number;
  derivedStatusBasis?: string;
  derivedStatusExplanation?: string;
}

/** Request payload for creating a billing record. */
export interface CreateBillingPayload {
  platform: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  billingDate: string;
  status?: BillingStatus;
  notes?: string;
}

/** Request payload for updating a billing record (any subset). */
export type UpdateBillingPayload = Partial<CreateBillingPayload>;

/** WP-3 — `GET /api/billing` is now paginated server-side (a safety cap, not
 *  a UI feature yet: the default `limit` is well above any current account's
 *  record count, so this is additive information, not a behavior change). */
export interface BillingPagination {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
}

/** Response `data` shapes returned by the billing endpoints. */
export interface BillingListData {
  billingRecords: BillingRecord[];
  pagination: BillingPagination;
}

export interface BillingData {
  billingRecord: BillingRecord;
}

export interface BillingDeletedData {
  id: string;
}

/** One currency's Paid-invoice total — see `BillingStats.revenueByCurrency`. */
export interface BillingRevenueByCurrency {
  currency: string;
  total: number;
}

/** Aggregate billing statistics for the billing dashboard. WP-3 (CLAUDE.md
 *  Sec10.3) — revenue is per-currency, never added together across
 *  currencies as one bare number; sorted highest-first. */
export interface BillingStats {
  totalRecords: number;
  paidRecords: number;
  pendingRecords: number;
  overdueRecords: number;
  revenueByCurrency: BillingRevenueByCurrency[];
}

export interface BillingStatsData {
  stats: BillingStats;
}

/** Result of a CSV bulk-import — a per-row error list, capped server-side. */
export interface ImportBillingResult {
  imported: number;
  failed: number;
  errors: { row: number; message: string }[];
}
