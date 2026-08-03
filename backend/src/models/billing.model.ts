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

/** Where a billing record came from — manual entry, or an automatic pull from
 *  a connected platform's own billing/usage API (see services/billing-sync). */
export const BILLING_SOURCES = ["manual", "auto_sync"] as const;
export type BillingSource = (typeof BILLING_SOURCES)[number];

/** Shape of the persisted billing fields. */
export interface IBilling {
  /** Owning user — every query MUST be scoped by this. */
  user: Types.ObjectId;
  /** Manually-created platform this record belongs to. Required for `manual`
   *  records; absent for `auto_sync` records (those link via `platformConnection`
   *  instead — there is no manual Platform document for a Pipedream connection). */
  platform?: Types.ObjectId;
  /** The connected platform this record was auto-synced from (auto_sync only). */
  platformConnection?: Types.ObjectId;
  source: BillingSource;
  /** The source API's own invoice/period identifier — the upsert key that keeps
   *  a re-sync from creating duplicates (auto_sync only). */
  externalId?: string;
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

export type BillingDocument = HydratedDocument<IBilling>;
type BillingModel = Model<IBilling>;

const billingSchema = new Schema<IBilling, BillingModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
        message: "Source must be manual or auto_sync",
      },
      default: "manual",
    },
    externalId: {
      type: String,
      trim: true,
      maxlength: [200, "External id must be at most 200 characters"],
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
// help here since `user` is never missing, so every manual record (which omits
// both platformConnection and externalId) would still collide on the same
// `{user, null, null}` entry — limiting a user to one manual record. The
// partial filter scopes the constraint to auto_sync records only, which are
// the only ones that ever set both fields.
billingSchema.index(
  { user: 1, platformConnection: 1, externalId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      platformConnection: { $exists: true },
      externalId: { $exists: true },
    },
  }
);

export const Billing = model<IBilling, BillingModel>("Billing", billingSchema);
