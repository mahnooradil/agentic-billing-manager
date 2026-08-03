/**
 * Support request model — backs the "Priority support" line in the Pro/
 * Business plan features. There is no support team/admin panel in this app,
 * so a request is both persisted (so the user can see its status) AND
 * emailed to the support inbox (best-effort) with a priority flag derived
 * from the requester's plan tier at submission time.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

export const SUPPORT_PRIORITIES = ["standard", "priority"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_STATUSES = ["open", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_CATEGORIES = [
  "billing",
  "technical",
  "account",
  "feature-request",
  "other",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export interface ISupportRequest {
  user: Types.ObjectId;
  category: SupportCategory;
  subject: string;
  message: string;
  /** Snapshot of the requester's plan tier at submission — Free = "standard",
   *  Pro/Business = "priority". Kept even if the user later switches tiers. */
  priority: SupportPriority;
  status: SupportStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type SupportRequestDocument = HydratedDocument<ISupportRequest>;
type SupportRequestModel = Model<ISupportRequest>;

const supportRequestSchema = new Schema<ISupportRequest, SupportRequestModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: SUPPORT_CATEGORIES,
      required: true,
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
      minlength: [3, "Subject must be at least 3 characters"],
      maxlength: [150, "Subject must be at most 150 characters"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      minlength: [10, "Message must be at least 10 characters"],
      maxlength: [2000, "Message must be at most 2000 characters"],
    },
    priority: {
      type: String,
      enum: SUPPORT_PRIORITIES,
      required: true,
    },
    status: {
      type: String,
      enum: SUPPORT_STATUSES,
      default: "open",
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

export const SupportRequest = model<ISupportRequest, SupportRequestModel>(
  "SupportRequest",
  supportRequestSchema
);
