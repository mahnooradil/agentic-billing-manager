/**
 * Notification model — Phase F2 (Autonomous Alerts & Notification Engine).
 *
 * Notifications are persistent, workspace-wide alerts generated automatically by
 * the Notification Engine from aggregated signals (analytics + recommendation
 * metadata) — never from raw/PII data and never via an AI provider call.
 *
 * One document per `signature` (dedup, exactly like the Recommendation Engine):
 * a recurring condition refreshes `updatedAt` instead of creating a duplicate.
 * Nothing is deleted — `archived` hides it while preserving history.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

export const NOTIFICATION_SEVERITIES = ["info", "warning", "critical"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/** Categories in F2 (renewal is deferred to the future Subscription phase). */
export const NOTIFICATION_CATEGORIES = [
  "billing",
  "recommendation",
  "usage",
  "system",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface INotification {
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  read: boolean;
  archived: boolean;
  /** Producer of the notification (the engine for now). */
  source: string;
  /** Stable identity for dedup (category + rule + context). */
  signature: string;
  /** Optional link to the recommendation that triggered it. */
  recommendationId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<INotification>;
type NotificationModel = Model<INotification>;

const notificationSchema = new Schema<INotification, NotificationModel>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    severity: {
      type: String,
      enum: NOTIFICATION_SEVERITIES,
      default: "info",
      index: true,
    },
    category: {
      type: String,
      enum: NOTIFICATION_CATEGORIES,
      default: "system",
      index: true,
    },
    read: { type: Boolean, default: false, index: true },
    archived: { type: Boolean, default: false, index: true },
    source: { type: String, default: "notification-engine" },
    signature: { type: String, required: true, index: true },
    recommendationId: {
      type: Schema.Types.ObjectId,
      ref: "Recommendation",
      default: undefined,
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

export const Notification = model<INotification, NotificationModel>(
  "Notification",
  notificationSchema
);
