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
      // Indexed to support analytics range filters and monthly-trend grouping.
      index: true,
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: {
        values: BILLING_STATUSES,
        message: "Status must be Pending, Paid, or Overdue",
      },
      default: "Pending",
      // Indexed to support analytics status breakdowns and paid/outstanding sums.
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be at most 1000 characters"],
      default: undefined,
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

export const Billing = model<IBilling, BillingModel>("Billing", billingSchema);
