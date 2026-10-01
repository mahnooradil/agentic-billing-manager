/**
 * UsageAccrual model — WP-4's domain-model fix. Separates month-to-date
 * metered usage/balance (most billing-sync adapters — see
 * services/billing-sync/types.ts's `BillingSyncRecordKind` docstring for
 * the exact census) from a real, discrete `Billing` invoice. Before this,
 * both were written into the SAME `Billing` collection with `source:
 * "auto_sync"`, which caused two confirmed problems: "outstanding"/overdue
 * totals accumulated permanently-pending accrual rows that could never
 * actually clear (124 of 129 adapters hardcode `status: "Pending"`
 * forever), and a platform connected via both billing-sync AND email-sync
 * could double-count the same real spend under two different records with
 * no way to catch it (different `platformConnection`, so Billing's own
 * dedup index can't help). A `UsageAccrual` row is explicitly never
 * counted as outstanding/overdue anywhere — it is usage visibility, not an
 * obligation.
 */
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

export interface IUsageAccrual {
  /** Owning organization — every query MUST be scoped by this. */
  organization: Types.ObjectId;
  user: Types.ObjectId;
  platformConnection: Types.ObjectId;
  /** The source adapter's own identifier for this accrual snapshot (the
   *  upsert key — a re-sync UPDATES the same month's row, it never
   *  duplicates it). */
  externalId: string;
  amount: number;
  currency: string;
  /** When this snapshot was taken (the sync time) — deliberately NOT
   *  called `billingDate`, since there is no real billing date for a
   *  usage snapshot; renaming it is itself part of this fix, so nothing
   *  can mistake it for an invoice date the way the old `Billing.
   *  billingDate` field did for this exact data. */
  snapshotAt: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type UsageAccrualDocument = HydratedDocument<IUsageAccrual>;
type UsageAccrualModel = Model<IUsageAccrual>;

const usageAccrualSchema = new Schema<IUsageAccrual, UsageAccrualModel>(
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
    platformConnection: {
      type: Schema.Types.ObjectId,
      ref: "PlatformConnection",
      required: true,
      index: true,
    },
    externalId: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, "External id must be at most 200 characters"],
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
    snapshotAt: {
      type: Date,
      required: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be at most 1000 characters"],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// A re-sync of the same connection's same accrual period UPDATES this row
// instead of duplicating it — mirrors Billing's own auto_sync dedup key.
usageAccrualSchema.index(
  { organization: 1, platformConnection: 1, externalId: 1 },
  { unique: true }
);

export const UsageAccrual = model<IUsageAccrual, UsageAccrualModel>(
  "UsageAccrual",
  usageAccrualSchema
);
