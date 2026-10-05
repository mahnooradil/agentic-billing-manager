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

/** flow/extra-02 Part A1 — a self-reported usage frequency, the cheapest and
 *  most honest usage signal available (no AI, no new integration): "Daily"
 *  covers everyday tools, "Occasionally" covers genuinely-but-lightly-used
 *  ones, "Rarely" covers "rarely or never" (the one that actually flags a
 *  cancel candidate). */
export const UTILITY_RATINGS = ["daily", "occasionally", "rarely"] as const;
export type UtilityRating = (typeof UTILITY_RATINGS)[number];

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
  /** WP-5's onboarding "confirm detected vendors" step — set once a human
   *  has looked at this vendor and confirmed it's real. Absent means
   *  "awaiting review" and surfaces this vendor in `GET /vendors/pending`.
   *  Existing vendors (created before this field existed) are backfilled to
   *  already-confirmed by `scripts/backfill-vendor-confirmation.ts` so this
   *  feature only ever prompts for genuinely NEW detections going forward,
   *  not a surprise backlog of vendors already in real, trusted use. */
  confirmedAt?: Date;
  /** Set instead of `confirmedAt` when a human says "not a real vendor" (the
   *  AI misread something as a vendor name). Non-destructive by the same
   *  reasoning as `Billing.duplicateOf` — only stops this vendor from being
   *  prompted for again; its already-synced Billing records are untouched. */
  rejectedAt?: Date;
  /** flow/extra-02 Part A1 — the user's own periodic self-report of how
   *  often they actually use this vendor. Absent means never rated yet.
   *  Only ever asked for a CONFIRMED vendor — rating something not even
   *  confirmed as real yet would be meaningless. */
  utilityRating?: UtilityRating;
  /** When `utilityRating` was last set — drives the "ask again after 60-90
   *  days" re-prompt in `listVendorsDueForRating` (a rating from months ago
   *  may no longer reflect real usage). */
  utilityRatedAt?: Date;
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
    confirmedAt: {
      type: Date,
    },
    rejectedAt: {
      type: Date,
    },
    utilityRating: {
      type: String,
      enum: { values: UTILITY_RATINGS, message: "Invalid utility rating" },
    },
    utilityRatedAt: {
      type: Date,
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
