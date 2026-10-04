/**
 * AuditLog model — WP-12 (CLAUDE.md Sec10 roadmap, flow/03 Sec7: "no audit
 * log on financial mutations... product/scope gap").
 *
 * An append-only record of WHO changed WHAT financial data and WHEN, for an
 * organization's own billing records. Separate from `BillingEvent` (which
 * tracks a Billing record's own payment-lifecycle EVIDENCE — invoices,
 * reminders, payment confirmations — to derive its status) — this tracks
 * the ADMINISTRATIVE act of a member creating, editing, or deleting a
 * record, independent of what the record's status says. The two answer
 * different questions: BillingEvent answers "why is this Paid?";
 * AuditLog answers "who deleted invoice #123, and when?" — including for a
 * record that no longer exists at all, which BillingEvent (itself deleted
 * alongside the Billing record it was about) cannot.
 *
 * Deliberately a plain summary string, not a full before/after field-level
 * diff — scoped to what a real accountability question needs ("who did
 * this, to which record, when") without building a generic diffing/
 * snapshot system this app doesn't otherwise need.
 */
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

export const AUDIT_LOG_ACTIONS = ["create", "update", "delete"] as const;
export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];

/** What kind of record this entry is about. A single value today
 *  (Billing mutations are the only audited action) — kept as an enum
 *  rather than a hardcoded "Billing" string so a future entity type
 *  (e.g. Platform) has somewhere to go without a schema change. */
export const AUDIT_LOG_ENTITY_TYPES = ["Billing"] as const;
export type AuditLogEntityType = (typeof AUDIT_LOG_ENTITY_TYPES)[number];

export interface IAuditLog {
  /** Owning organization — every query MUST be scoped by this. */
  organization: Types.ObjectId;
  /** The member who performed the action. */
  user: Types.ObjectId;
  action: AuditLogAction;
  entityType: AuditLogEntityType;
  /** The affected record's id — kept even after a `delete`, since the
   *  record itself is gone; this is the only remaining trace it existed. */
  entityId: Types.ObjectId;
  /** Short, human-readable description, e.g. "Deleted invoice INV-102
   *  (Acme Corp, $142.50 USD)" — written once at the time of the action,
   *  from data that may no longer exist afterward (a deleted record). */
  summary: string;
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;
type AuditLogModel = Model<IAuditLog>;

const auditLogSchema = new Schema<IAuditLog, AuditLogModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      enum: { values: AUDIT_LOG_ACTIONS, message: "Invalid audit log action" },
      required: true,
    },
    entityType: {
      type: String,
      enum: { values: AUDIT_LOG_ENTITY_TYPES, message: "Invalid audit log entity type" },
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    summary: {
      type: String,
      trim: true,
      maxlength: [300, "Summary must be at most 300 characters"],
      required: true,
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

// Listing one organization's log, newest first — the only real access
// pattern (see audit-log.controller.ts).
auditLogSchema.index({ organization: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog, AuditLogModel>("AuditLog", auditLogSchema);
