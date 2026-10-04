/**
 * Billing model — Phase 7A.
 *
 * A billing record is a single invoice that belongs to one Platform. It captures
 * who was billed, how much, in which currency, when, and its payment status.
 *
 * - `platform` is a required reference to a Platform document.
 * - `timestamps` adds `createdAt` / `updatedAt` automatically.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

import { DERIVED_STATUSES, DERIVED_STATUS_BASES } from "@/services/billing/status-machine";

/** Allowed billing statuses. Single source of truth for schema + validators. */
export const BILLING_STATUSES = ["Pending", "Paid", "Overdue"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

/** Where a billing record came from — manual entry, an automatic pull from a
 *  connected platform's own billing/usage API (see services/billing-sync), or
 *  a periodic scan of a connected Gmail/Outlook inbox for invoice-like
 *  emails, used as a fallback for platforms with no billing-sync adapter
 *  (see services/email-sync). */
export const BILLING_SOURCES = ["manual", "auto_sync", "email_sync"] as const;
export type BillingSource = (typeof BILLING_SOURCES)[number];

/** Shape of the persisted billing fields. */
export interface IBilling {
  /** Owning organization — every query MUST be scoped by this. */
  organization: Types.ObjectId;
  /** Which member created this record — audit trail only, never a query filter. */
  user: Types.ObjectId;
  /** Manually-created platform this record belongs to. Required for `manual`
   *  records; absent for `auto_sync`/`email_sync` records (those link via
   *  `platformConnection` instead — there is no manual Platform document for a
   *  Pipedream connection). */
  platform?: Types.ObjectId;
  /** The connected platform this record was synced from (auto_sync/email_sync). */
  platformConnection?: Types.ObjectId;
  /** The actual vendor this bill is FROM, when it differs from the
   *  connection itself — e.g. one Gmail inbox's connection covers Netflix,
   *  Spotify, GitHub, etc., each needing its own display name distinct from
   *  "Gmail". Populated only by email-sync's AI extraction (see
   *  ai-invoice-extractor.ts's `customerName` field, which despite its name
   *  reports the VENDOR, not the recipient). Unused for a manual record or
   *  an auto_sync one, where the platform ref/connection already IS the
   *  vendor and needs no override — see billing.serializer.ts's
   *  `toPublicBilling` for where this actually gets shown as "platform". */
  vendorName?: string;
  /** The vendor's real, shared identity (Task 7) — a reference to a `Vendor`
   *  document, resolved by domain (email_sync) or name (auto_sync) via
   *  services/vendors/vendor-resolver.service.ts. Unlike `vendorName`
   *  (a per-record string snapshot), this is the SAME document across every
   *  record that's really the same vendor, however many connections
   *  surfaced them — what actually makes "show invoices from AWS" return
   *  every AWS record regardless of source, and lets analytics group by the
   *  real vendor instead of by connection. Only ever set for auto_sync/
   *  email_sync records — a manual record's `platform` ref already is a
   *  one-platform-one-vendor identity, so it needs no second one here. */
  vendor?: Types.ObjectId;
  /** Denormalized copy of the resolved vendor's domain (when it has one) —
   *  lets a query filter/index on domain without a populate. */
  vendorDomain?: string;
  source: BillingSource;
  /** The source's own invoice/period/message identifier — the upsert key that
   *  keeps a re-sync from creating duplicates (auto_sync/email_sync only). */
  externalId?: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  billingDate: Date;
  /** When payment is due — only ever populated for auto_sync/email_sync
   *  records whose source actually states one (e.g. a Gmail/Outlook invoice
   *  parsed by the AI extractor). Powers the "due in N days" alert. */
  dueDate?: Date;
  status: BillingStatus;
  notes?: string;
  /** Set whenever a human edits this record directly (Billing page's edit
   *  form, or the Billing Advisor Agent's confirm button) — see
   *  billing.controller.ts's `updateBillingRecord`. A later email-sync pass
   *  that re-reads an OLDER email (one dated before this timestamp) must not
   *  overwrite the human's correction with stale information; see
   *  services/email-sync/sync-engine.ts's commit step, which checks this
   *  against each candidate email's own date before writing. */
  manuallyEditedAt?: Date;
  /** Provenance trail — email_sync only. Lets a user or the agent verify
   *  "where did this actually come from" instead of taking a single AI
   *  extraction on faith. Absent for manual/auto_sync records (a manual
   *  entry has no source email; an auto_sync record comes from a platform's
   *  own billing API, not an email — its provenance IS `platformConnection`).
   *  Additive/optional so older records simply lack these until re-synced —
   *  no backfill migration needed. */
  sourceMessageId?: string;
  /** The provider's conversation/thread id (Gmail `threadId`, Outlook
   *  `conversationId`) — groups this message with its replies. */
  sourceThreadId?: string;
  senderEmail?: string;
  senderDomain?: string;
  /** When the source email itself arrived (distinct from `billingDate`,
   *  which is the invoice's own stated date). */
  receivedAt?: Date;
  subject?: string;
  /** The AI extractor's own confidence (0-1) in this extraction — see
   *  ai-invoice-extractor.ts's `confidence` field. */
  extractionConfidence?: number;
  extractionModel?: string;
  extractedAt?: Date;
  /** Short, sanitized snippets of the source email's own text that support
   *  the extracted fields — a deterministic, bounded excerpt of the actual
   *  email body (computed in code, never AI-generated), so this can never
   *  become a second prompt-injection surface for attacker-controlled text
   *  reflected back through a model. */
  evidence?: string[];
  /** Task 9 (sender verification) — the receiving mail server's own DMARC
   *  verdict for this email (the alignment check, not SPF/DKIM alone —
   *  DMARC is specifically "does this pass AND align with the From:
   *  domain," which is the actual spoofing question). `extractionConfidence`
   *  above is downgraded when this is "fail" — see sync-engine.ts's commit
   *  step. "none" means no DMARC record/result at all, common for smaller
   *  legitimate vendors — not itself treated as evidence of spoofing. */
  senderAuthResult?: "pass" | "fail" | "none";
  /** True when this email's `Reply-To` domain differs from its `From`
   *  domain — a classic business-email-compromise pattern independent of
   *  DMARC (a spoofed domain can still pass DMARC if the attacker controls
   *  that exact domain's records; this catches a different case: a genuine
   *  domain whose replies are silently redirected elsewhere). */
  senderReplyToMismatch?: boolean;
  /** Task 8 — an INDEPENDENT status computed by `deriveStatus()` from this
   *  record's full `BillingEvent` history, stored alongside the real
   *  `status` field above. **Cut over for email_sync records** (narrow
   *  scope, not the full 11-state target vocabulary — see status-machine.ts's
   *  `mapDerivedStatusToBillingStatus`): email-sync/sync-engine.ts's commit
   *  loop now maps this result back onto `status` itself after every write,
   *  which is what actually fixes GM-027 (a stale reminder reverting a Paid
   *  invoice back to Pending). Still purely observational for manual and
   *  auto_sync (billing-sync adapter) records — those write `status`
   *  directly and never read these fields back. Recomputed by
   *  services/billing/billing-event-recorder.service.ts every time a new
   *  BillingEvent is appended. Absent until at least one event exists. */
  derivedStatus?: string;
  derivedStatusConfidence?: number;
  derivedStatusBasis?: string;
  derivedStatusExplanation?: string;
  derivedStatusUpdatedAt?: Date;
  /** WP-5 trust surfaces — duplicate flag + merge (non-destructive). When
   *  set, this record is a confirmed duplicate of the referenced (canonical)
   *  Billing record: nothing is ever deleted (the user's own explicit
   *  choice when asked — reversible over data-destroying), this record is
   *  just hidden from the default list/stats and excluded from revenue/
   *  overdue totals so it doesn't double-count. `POST /billing/:id/unmerge`
   *  clears this to undo. Mutually exclusive in practice with
   *  `duplicateDismissedAt` (a record is either merged away, dismissed as
   *  NOT a duplicate, or neither — never both at once, though nothing
   *  enforces that beyond the controllers' own logic, since there's no
   *  harm in both being theoretically settable). */
  duplicateOf?: Types.ObjectId;
  /** Set when a user reviews a flagged candidate pair and says "these are
   *  NOT duplicates" — excludes this record from future duplicate-candidate
   *  detection (see billing-duplicate-detector.service.ts) so the same
   *  false positive doesn't keep resurfacing on every visit. */
  duplicateDismissedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type BillingDocument = HydratedDocument<IBilling>;
type BillingModel = Model<IBilling>;

const billingSchema = new Schema<IBilling, BillingModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    platform: {
      type: Schema.Types.ObjectId,
      ref: "Platform",
      index: true,
    },
    platformConnection: {
      type: Schema.Types.ObjectId,
      ref: "PlatformConnection",
      index: true,
    },
    source: {
      type: String,
      enum: {
        values: BILLING_SOURCES,
        message: "Source must be manual, auto_sync, or email_sync",
      },
      default: "manual",
    },
    externalId: {
      type: String,
      trim: true,
      maxlength: [200, "External id must be at most 200 characters"],
    },
    vendorName: {
      type: String,
      trim: true,
      maxlength: [100, "Vendor name must be at most 100 characters"],
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
      index: true,
    },
    vendorDomain: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [255, "Vendor domain must be at most 255 characters"],
      index: true,
    },
    customerName: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      minlength: [2, "Customer name must be at least 2 characters"],
      maxlength: [100, "Customer name must be at most 100 characters"],
    },
    invoiceNumber: {
      type: String,
      required: [true, "Invoice number is required"],
      trim: true,
      minlength: [1, "Invoice number is required"],
      maxlength: [50, "Invoice number must be at most 50 characters"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount must be zero or greater"],
    },
    currency: {
      type: String,
      required: [true, "Currency is required"],
      uppercase: true,
      trim: true,
      minlength: [3, "Currency must be a 3-letter code"],
      maxlength: [3, "Currency must be a 3-letter code"],
    },
    billingDate: {
      type: Date,
      required: [true, "Billing date is required"],
      // No single-field index here — every real query filters by organization
      // first (see the compound index below), so a bare billingDate index
      // would never be the one actually used.
    },
    dueDate: {
      type: Date,
      // WP-3 (CLAUDE.md Sec10.3, flow/02 item 21) — `runDueDateNotifications`
      // and `autoMarkOverdue` (services/notification/notification-engine.ts)
      // both query `dueDate` across EVERY organization at once (no
      // `organization` filter — they're cross-tenant background jobs, not a
      // per-request read), so this is the one Billing index that's
      // deliberately NOT organization-prefixed.
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: BILLING_STATUSES,
        message: "Status must be Pending, Paid, or Overdue",
      },
      default: "Pending",
      // No single-field index here — see the compound index below.
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be at most 1000 characters"],
      default: undefined,
    },
    manuallyEditedAt: {
      type: Date,
    },
    sourceMessageId: {
      type: String,
      trim: true,
      maxlength: [200, "Source message id must be at most 200 characters"],
    },
    sourceThreadId: {
      type: String,
      trim: true,
      maxlength: [200, "Source thread id must be at most 200 characters"],
    },
    senderEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [320, "Sender email must be at most 320 characters"],
    },
    senderDomain: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [255, "Sender domain must be at most 255 characters"],
    },
    receivedAt: {
      type: Date,
    },
    subject: {
      type: String,
      trim: true,
      maxlength: [500, "Subject must be at most 500 characters"],
    },
    extractionConfidence: {
      type: Number,
      min: [0, "Extraction confidence must be between 0 and 1"],
      max: [1, "Extraction confidence must be between 0 and 1"],
    },
    extractionModel: {
      type: String,
      trim: true,
      maxlength: [100, "Extraction model must be at most 100 characters"],
    },
    extractedAt: {
      type: Date,
    },
    evidence: {
      type: [{ type: String, trim: true, maxlength: 300 }],
      default: undefined,
    },
    senderAuthResult: {
      type: String,
      enum: { values: ["pass", "fail", "none"], message: "Invalid sender auth result" },
    },
    senderReplyToMismatch: {
      type: Boolean,
    },
    derivedStatus: {
      type: String,
      enum: { values: DERIVED_STATUSES, message: "Invalid derived status" },
    },
    derivedStatusConfidence: {
      type: Number,
      min: [0, "Derived status confidence must be between 0 and 1"],
      max: [1, "Derived status confidence must be between 0 and 1"],
    },
    derivedStatusBasis: {
      type: String,
      enum: { values: DERIVED_STATUS_BASES, message: "Invalid derived status basis" },
    },
    derivedStatusExplanation: {
      type: String,
      trim: true,
      maxlength: [500, "Derived status explanation must be at most 500 characters"],
    },
    derivedStatusUpdatedAt: {
      type: Date,
    },
    duplicateOf: {
      type: Schema.Types.ObjectId,
      ref: "Billing",
      index: true,
    },
    duplicateDismissedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    // Strip Mongoose internals if a document is ever serialized directly.
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Every record belongs to exactly one of: a manual Platform, or a synced
// PlatformConnection — never both, never neither.
billingSchema.pre("validate", function () {
  if (Boolean(this.platform) === Boolean(this.platformConnection)) {
    this.invalidate(
      "platform",
      "A billing record must reference exactly one of platform or platformConnection"
    );
  }
});

// Re-syncing a connection must UPDATE its own previously-synced records, not
// duplicate them. A partial (not merely sparse) index: `sparse` alone doesn't
// help here since `organization` is never missing, so every manual record
// (which omits both platformConnection and externalId) would still collide on
// the same `{organization, null, null}` entry — limiting an org to one manual
// record. The partial filter scopes the constraint to auto_sync/email_sync
// records only, which are the only ones that ever set both fields.
billingSchema.index(
  { organization: 1, platformConnection: 1, externalId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      platformConnection: { $exists: true },
      externalId: { $exists: true },
    },
  }
);

// WP-3 (CLAUDE.md Sec10.3, flow/02 item 21) — every real query here is
// scoped by organization first (the universal tenant filter — see this
// file's own docstring), so these replace what used to be bare single-field
// `billingDate`/`status` indexes: a query like "this org's billing in the
// last 6 months, newest first" or "this org's Paid/Pending/Overdue counts"
// could previously only ever use ONE of {organization} or {billingDate}/
// {status} per query, never both together.
billingSchema.index({ organization: 1, billingDate: -1 });
billingSchema.index({ organization: 1, status: 1 });

export const Billing = model<IBilling, BillingModel>("Billing", billingSchema);
