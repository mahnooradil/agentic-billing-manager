/**
 * Classification feedback log — WP-11's learning loop (flow/04 §7). An
 * append-only record of every point a human's action disagreed (or agreed)
 * with the AI's "this is a real invoice" classification for one email-
 * derived Billing record. `SenderProfile`'s counts are DERIVED from this
 * log (recomputable, auditable), not the only source of truth for "why is
 * this sender suppressed" — same append-only-event-log pattern already
 * established by `BillingEvent`/`AuditLog` in this codebase.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

export const CLASSIFICATION_VERDICTS = ["confirmed", "false_positive"] as const;
export type ClassificationVerdict = (typeof CLASSIFICATION_VERDICTS)[number];

export interface IClassificationFeedback {
  /** Owning organization — every query MUST be scoped by this. */
  organization: Types.ObjectId;
  /** The sender domain this feedback is actually about — the key
   *  `SenderProfile` aggregates by. */
  domain: string;
  /** The Billing record this feedback came from, when it still exists
   *  (absent after a delete, since the record itself is gone by then —
   *  this log entry is what survives it). */
  billing?: Types.ObjectId;
  /** The source email's own id, when known — closest match to flow/04's
   *  literal `messageId` field. */
  sourceMessageId?: string;
  /** What the AI originally said. Always "billing_email" today — the AI
   *  extractor only ever reaches this point (a Billing record gets
   *  created) when it judged a message to BE a real invoice; a message it
   *  judged NOT billing never produces a record for a human to react to in
   *  the first place. Kept as an explicit field (not hardcoded in code
   *  that reads this) so a future second AI verdict type has somewhere to
   *  go without a schema change. */
  aiVerdict: "billing_email";
  /** What the human's action actually implied. "false_positive" is a real,
   *  explicit signal (the user deleted it); "confirmed" is inferred by the
   *  nightly job from the record simply surviving — see
   *  sender-profile-scheduler.ts. */
  userVerdict: ClassificationVerdict;
  at: Date;
}

export type ClassificationFeedbackDocument = HydratedDocument<IClassificationFeedback>;
type ClassificationFeedbackModel = Model<IClassificationFeedback>;

const classificationFeedbackSchema = new Schema<
  IClassificationFeedback,
  ClassificationFeedbackModel
>({
  organization: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  domain: { type: String, required: true, trim: true, lowercase: true },
  billing: { type: Schema.Types.ObjectId, ref: "Billing" },
  sourceMessageId: { type: String, trim: true },
  aiVerdict: {
    type: String,
    enum: { values: ["billing_email"], message: "Invalid AI verdict" },
    required: true,
  },
  userVerdict: {
    type: String,
    enum: { values: CLASSIFICATION_VERDICTS, message: "Invalid user verdict" },
    required: true,
  },
  at: { type: Date, required: true, default: Date.now },
});

classificationFeedbackSchema.index({ organization: 1, domain: 1, at: -1 });

export const ClassificationFeedback = model<IClassificationFeedback, ClassificationFeedbackModel>(
  "ClassificationFeedback",
  classificationFeedbackSchema
);
