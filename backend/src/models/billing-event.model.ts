/**
 * BillingEvent model — Task 8 (status state machine).
 *
 * An append-only log: one row per OBSERVATION about a Billing record's
 * payment lifecycle (an invoice email, a reminder, a payment confirmation, a
 * manual correction, ...), never mutated after it's written. `Billing.status`
 * itself is still written exactly as before by the existing sync-engine
 * logic — nothing about current behavior changes. This log is the evidence
 * trail a NEW, separate `deriveStatus()` function (services/billing/
 * status-machine.ts) reads to compute an independent `derivedStatus*` on the
 * Billing record, dual-written alongside the real `status` for comparison —
 * exactly the "ship behind a flag, dual-write, compare, then cut over"
 * sequencing the roadmap calls for. See status-machine.ts's own docstring
 * for why an append-only log fixes the real bug this exists for: a stale
 * reminder arriving after a genuine payment confirmation currently flips a
 * Paid invoice back to Pending, because today's code only ever looks at the
 * LATEST email, never the full history.
 */
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

/** Every event type a Billing record's history can contain. `disputed` has
 *  no producer yet (no event source in this codebase asserts a dispute) —
 *  kept only so `status-machine.ts`'s vocabulary matches the audit's target
 *  design; not wired to anything until a future extraction/webhook adds it. */
export const BILLING_EVENT_TYPES = [
  "invoice_issued",
  "reminder",
  "final_reminder",
  "payment_confirmed",
  "payment_failed",
  "refunded",
  "partially_refunded",
  "cancelled",
  "credit_note",
  "amount_changed",
  "user_correction",
] as const;
export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

/** Where this observation came from. Mirrors `Billing.source` but is its
 *  own field since one Billing record accumulates events from more than one
 *  origin over its life (an email-derived invoice, later manually corrected). */
export const BILLING_EVENT_SOURCES = ["email_sync", "auto_sync", "user"] as const;
export type BillingEventSource = (typeof BILLING_EVENT_SOURCES)[number];

export interface IBillingEvent {
  /** Owning organization — every query MUST be scoped by this. */
  organization: Types.ObjectId;
  /** The Billing record this observation is about. */
  billing: Types.ObjectId;
  type: BillingEventType;
  /** When the underlying evidence actually happened — an email's own
   *  `receivedAt`, or "now" for a manual correction. NOT when this row was
   *  written (see `createdAt`) — the state machine sorts and reasons by
   *  this field, which is what makes an out-of-order sync run (a later run
   *  processing an OLDER email) resolve correctly. */
  occurredAt: Date;
  /** This observation's own confidence (0-1) — carried from the AI
   *  extraction's `extractionConfidence` for a synced event, or 1.0 for a
   *  human's own correction (a person is never "unsure" the way a model
   *  extraction can be). */
  confidence: number;
  source: BillingEventSource;
  /** Only for `user_correction` — the status the human actually set. Reuses
   *  the existing 3-state `BillingStatus` enum, not the richer derived
   *  vocabulary, because that's still all the app's own UI ever lets a user
   *  pick (see billing.model.ts's `BILLING_STATUSES`). */
  correctedStatus?: "Pending" | "Paid" | "Overdue";
  /** Only for `amount_changed` — the newly observed amount. */
  amount?: number;
  /** Traces back to the source email, when there is one — same id space as
   *  `Billing.sourceMessageId` (Task 6). */
  sourceMessageId?: string;
  /** Only for `source: "user"` — who made the correction. */
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

export type BillingEventDocument = HydratedDocument<IBillingEvent>;
type BillingEventModel = Model<IBillingEvent>;

const billingEventSchema = new Schema<IBillingEvent, BillingEventModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    billing: {
      type: Schema.Types.ObjectId,
      ref: "Billing",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: { values: BILLING_EVENT_TYPES, message: "Invalid billing event type" },
      required: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: [0, "Confidence must be between 0 and 1"],
      max: [1, "Confidence must be between 0 and 1"],
    },
    source: {
      type: String,
      enum: { values: BILLING_EVENT_SOURCES, message: "Invalid billing event source" },
      required: true,
    },
    correctedStatus: {
      type: String,
      enum: { values: ["Pending", "Paid", "Overdue"], message: "Invalid corrected status" },
    },
    amount: {
      type: Number,
      min: [0, "Amount must be zero or greater"],
    },
    sourceMessageId: {
      type: String,
      trim: true,
      maxlength: [200, "Source message id must be at most 200 characters"],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// The state machine's own primary access pattern: every event for one
// Billing record, oldest first.
billingEventSchema.index({ billing: 1, occurredAt: 1 });

export const BillingEvent = model<IBillingEvent, BillingEventModel>(
  "BillingEvent",
  billingEventSchema
);
