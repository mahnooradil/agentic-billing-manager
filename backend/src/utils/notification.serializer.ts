/**
 * Notification serializer — Phase F2. Single source of truth for the wire shape.
 */
import type {
  NotificationDocument,
  NotificationSeverity,
  NotificationCategory,
} from "@/models/notification.model";

export interface PublicNotification {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  read: boolean;
  archived: boolean;
  recommendationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicNotification(
  doc: NotificationDocument
): PublicNotification {
  return {
    id: doc._id.toString(),
    title: doc.title,
    message: doc.message,
    severity: doc.severity,
    category: doc.category,
    read: doc.read,
    archived: doc.archived,
    recommendationId: doc.recommendationId
      ? doc.recommendationId.toString()
      : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
