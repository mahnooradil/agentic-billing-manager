/**
 * Processed-message store — the fix for the email-sync re-extraction loop
 * (P0-03 / the 24x cost multiplier). Before this existed, every hourly sync
 * run re-fetched and re-ran the AI extractor on every candidate message
 * still inside the search window (see `OVERLAP_DAYS` and the watermark
 * logic in `services/email-sync/sync-engine.ts`), which is what caused both
 * the steady-state cost multiplier and the "backfill never completes above
 * 200 messages per run" bug. A record here means one message's content was
 * actually looked at by the AI extractor and a real verdict reached — the
 * extractor is never asked about the same message twice, regardless of how
 * many times it reappears in a search window across runs.
 *
 * `outcome: "error"` is deliberately NOT a valid value here and is never
 * written — see `sync-engine.ts`'s handling: a message that failed to be
 * checked at all (a transient network/API failure) must remain eligible for
 * a retry on a future run, not be silently treated as permanently "done."
 * `OVERLAP_DAYS`'s rolling window is what gives such a message its retry
 * chance; marking it processed here would defeat that on purpose.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

/** How long a record is kept before MongoDB's TTL monitor removes it. Long
 *  enough that no real provider search window could ever re-surface a
 *  message this old; short enough the collection doesn't grow forever. */
export const PROCESSED_MESSAGE_TTL_DAYS = 180;

/** "suppressed_sender" (WP-11) — the message was skipped BEFORE the AI ever
 *  looked at it, because its sender's `SenderProfile.trust` is
 *  "suppressed" (learned or manually set) — distinct from "not_billing"
 *  (the AI DID look and said no), since this one never cost any credits. */
export type ProcessedMessageOutcome = "invoice" | "not_billing" | "suppressed_sender";

export interface IProcessedMessage {
  connection: Types.ObjectId;
  messageId: string;
  outcome: ProcessedMessageOutcome;
  processedAt: Date;
  expiresAt: Date;
}

export type ProcessedMessageDocument = HydratedDocument<IProcessedMessage>;
type ProcessedMessageModel = Model<IProcessedMessage>;

const processedMessageSchema = new Schema<IProcessedMessage, ProcessedMessageModel>({
  connection: {
    type: Schema.Types.ObjectId,
    ref: "PlatformConnection",
    required: true,
  },
  messageId: { type: String, required: true, trim: true },
  outcome: {
    type: String,
    enum: { values: ["invoice", "not_billing", "suppressed_sender"], message: "Invalid outcome" },
    required: true,
  },
  processedAt: { type: Date, required: true, default: Date.now },
  // TTL — fires at the field's own value (`expireAfterSeconds: 0`), set at
  // insert time to `processedAt + PROCESSED_MESSAGE_TTL_DAYS`.
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

// The actual dedup guarantee: one record per (connection, messageId), ever.
processedMessageSchema.index({ connection: 1, messageId: 1 }, { unique: true });

export const ProcessedMessage = model<IProcessedMessage, ProcessedMessageModel>(
  "ProcessedMessage",
  processedMessageSchema
);
