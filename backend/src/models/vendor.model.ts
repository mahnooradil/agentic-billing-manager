/**
 * Vendor model — Task 7 (Vendor domain model).
 *
 * A Vendor is the actual real-world counterparty a bill is FROM (Netflix,
 * AWS, ...), as its own identity, independent of which `PlatformConnection`
 * happened to surface a given invoice. This is what `Billing.platform` /
 * `Billing.platformConnection` cannot represent on their own: one connection
 * (a Gmail inbox) can surface many vendors, and the SAME real vendor can be
 * billed through more than one connection (e.g. a direct AWS billing-sync
 * connection AND an AWS invoice email landing in the same inbox) — without a
 * shared identity those look like two unrelated things everywhere a bill's
 * source is grouped or searched (the audit's "double-counting"/"AWS search
 * fails" findings share this one root cause).
 *
 * Deliberately scoped to `auto_sync`/`email_sync` records only — a `manual`
 * Billing record already references a manually-created `Platform`, which
 * already IS a one-platform-one-vendor identity; forcing manual records
 * through this model too would add a second, redundant vendor concept for
 * no real gain. See `billing.model.ts`'s `vendor`/`vendorDomain` fields.
 */
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

export interface IVendor {
  /** Owning organization — every query MUST be scoped by this. */
  organization: Types.ObjectId;
  /** Display name — the vendor's own branding (e.g. "Netflix", "AWS"). */
  name: string;
  /** Lowercased sending domain (e.g. "netflix.com") when known — the
   *  primary, reliable identity key for an email-derived vendor. Absent for
   *  a billing-sync adapter vendor (a platform's own API has no "domain" to
   *  observe) — those dedupe by name instead (see `dedupeKey`). */
  domain?: string;
  /** Internal identity key the unique index is actually built on — the
   *  domain when known, else a normalized ("name:"-prefixed, lowercased)
   *  form of `name`. A single always-present field, rather than two
   *  overlapping partial-filter indexes, because MongoDB's
   *  `partialFilterExpression` does not support a "field does not exist"
   *  condition (`$exists: false` / `$not` are both rejected) — only a
   *  positive `$exists: true` is allowed, which can express "has a domain"
   *  but not its opposite. Never exposed via the API (see `toJSON.transform`
   *  below) — a pure implementation detail of the dedup key. */
  dedupeKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export type VendorDocument = HydratedDocument<IVendor>;
type VendorModel = Model<IVendor>;

const vendorSchema = new Schema<IVendor, VendorModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Vendor name is required"],
      trim: true,
      maxlength: [150, "Vendor name must be at most 150 characters"],
    },
    domain: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [255, "Vendor domain must be at most 255 characters"],
    },
    dedupeKey: {
      type: String,
      required: true,
      maxlength: [270, "Vendor dedupe key must be at most 270 characters"],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        delete ret.dedupeKey;
        return ret;
      },
    },
  }
);

// The one real identity constraint: one vendor per dedupe key per
// organization — see `dedupeKey`'s own docstring for why this is a single
// computed field rather than two partial-filter indexes.
vendorSchema.index({ organization: 1, dedupeKey: 1 }, { unique: true });

export const Vendor = model<IVendor, VendorModel>("Vendor", vendorSchema);
