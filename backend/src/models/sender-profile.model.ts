/**
 * Sender trust profile — WP-11's learning loop (flow/04 §7's "Organization"
 * tier). One document per (organization, sender domain), tracking whether
 * that sender's emails have historically been real invoices or false
 * positives, so the pipeline can learn instead of treating every sync run
 * identically forever.
 *
 * Deliberately gated on the provenance/domain-model work (`senderDomain`,
 * `manuallyEditedAt`) landing first — flow/04's own stated dependency — now
 * satisfied (WP-4/WP-5, done 2026-10-04).
 *
 * Scope note: flow/04 also names a separate `UserRule` model for "ignore
 * domain X" style manual rules. That capability is folded into THIS model
 * via `manuallySet` instead of a second, parallel model — a manual
 * suppression and a learned one both answer the exact same question ("how
 * much do we trust this sender"), so two models would just need
 * reconciliation logic a single `manuallySet` flag already gives for free.
 * The other half of `UserRule` ("remind N days before Z") is a different
 * concept (a custom reminder, not a sender-trust rule) and is explicitly
 * NOT built here — flagged as a separate, not-yet-specified feature, not an
 * oversight.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

export const SENDER_TRUST_LEVELS = ["neutral", "trusted", "suppressed"] as const;
export type SenderTrust = (typeof SENDER_TRUST_LEVELS)[number];

export interface ISenderProfile {
  /** Owning organization — every query MUST be scoped by this. */
  organization: Types.ObjectId;
  /** Lowercased sending domain (e.g. "netflix.com") — the same identity key
   *  `Vendor.domain`/`Billing.senderDomain` already use. */
  domain: string;
  trust: SenderTrust;
  /** How many email_sync Billing records from this domain have survived
   *  (not been deleted) long enough to count as a real confirmation —
   *  recomputed by the nightly job, not incremented per-event (there's no
   *  discrete "confirmed" action to hook into — the signal is the ABSENCE
   *  of a correction over time). */
  confirmedInvoiceCount: number;
  /** How many times a human deleted an email_sync Billing record from this
   *  domain — incremented in real time at the point of deletion (see
   *  billing.controller.ts), since that IS a discrete, unambiguous event. */
  falsePositiveCount: number;
  /** Set directly by the user (via a manual suppress/restore action),
   *  takes precedence over the auto-learned trust and is never silently
   *  overwritten by the nightly job's own trust-transition logic. */
  manuallySet: boolean;
  /** When the nightly job last evaluated this profile for a trust
   *  transition — observability only, not itself a trigger for anything. */
  lastEvaluatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SenderProfileDocument = HydratedDocument<ISenderProfile>;
type SenderProfileModel = Model<ISenderProfile>;

const senderProfileSchema = new Schema<ISenderProfile, SenderProfileModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    domain: {
      type: String,
      required: [true, "Sender domain is required"],
      trim: true,
      lowercase: true,
      maxlength: [255, "Domain must be at most 255 characters"],
    },
    trust: {
      type: String,
      enum: { values: SENDER_TRUST_LEVELS, message: "Invalid trust level" },
      default: "neutral",
    },
    confirmedInvoiceCount: { type: Number, default: 0, min: 0 },
    falsePositiveCount: { type: Number, default: 0, min: 0 },
    manuallySet: { type: Boolean, default: false },
    lastEvaluatedAt: { type: Date },
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

// One profile per (organization, domain) — resolveSenderProfile upserts on this.
senderProfileSchema.index({ organization: 1, domain: 1 }, { unique: true });

export const SenderProfile = model<ISenderProfile, SenderProfileModel>(
  "SenderProfile",
  senderProfileSchema
);
