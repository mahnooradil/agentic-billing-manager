/**
 * Credit transaction — an immutable ledger entry for every change to a user's
 * `creditsBalance` (see models/user.model.ts). Exists so credit usage/grants
 * are auditable (and so a future Stripe purchase flow has somewhere to record
 * "why did the balance change" beyond just the current number). Written only
 * by services/credits/credit-ledger.service.ts — never edited after creation.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

/** What caused this balance change. */
export const CREDIT_TRANSACTION_TYPES = [
  "grant",
  "consume",
  "purchase",
  "refund",
] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];

export interface ICreditTransaction {
  user: Types.ObjectId;
  type: CreditTransactionType;
  /** Signed delta applied to the balance (positive for grant/purchase/refund,
   *  negative for consume). */
  amount: number;
  /** Balance snapshot immediately after this entry — makes the ledger
   *  self-auditing without recomputing a running sum. */
  balanceAfter: number;
  /** Short machine-readable reason, e.g. "signup_grant", "agent_message". */
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreditTransactionDocument = HydratedDocument<ICreditTransaction>;
type CreditTransactionModel = Model<ICreditTransaction>;

const creditTransactionSchema = new Schema<ICreditTransaction, CreditTransactionModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: CREDIT_TRANSACTION_TYPES,
        message: "Type must be grant, consume, purchase, or refund",
      },
      required: [true, "Type is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
    },
    balanceAfter: {
      type: Number,
      required: [true, "Balance after is required"],
      // No `min` here on purpose: a single turn's actual token cost is only
      // known AFTER it runs, so a turn that was allowed to start (balance > 0
      // at the pre-check) can still land the balance slightly below zero —
      // recorded honestly rather than clamped, since the API cost already
      // happened. The pre-check is what stops the NEXT turn, not this field.
    },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
      maxlength: [200, "Reason must be at most 200 characters"],
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

// Recent-history lookups are always "this user's transactions, newest first".
creditTransactionSchema.index({ user: 1, createdAt: -1 });

export const CreditTransaction = model<ICreditTransaction, CreditTransactionModel>(
  "CreditTransaction",
  creditTransactionSchema
);
