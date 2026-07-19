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

/** Shape of the persisted billing fields. */
export interface IBilling {
  platform: Types.ObjectId;
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
    platform: {
      type: Schema.Types.ObjectId,
      ref: "Platform",
      required: [true, "Platform is required"],
      index: true,
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
    },
    status: {
      type: String,
      enum: {
        values: BILLING_STATUSES,
        message: "Status must be Pending, Paid, or Overdue",
      },
      default: "Pending",
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

export const Billing = model<IBilling, BillingModel>("Billing", billingSchema);
