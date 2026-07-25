/**
 * Notification types (Phase F2). Mirror the backend `/api/notifications`
 * contract. Notifications are persistent workspace alerts with read/archive
 * lifecycle; they are generated autonomously on the backend.
 */
export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationCategory =
  | "billing"
  | "recommendation"
  | "usage"
  | "system";
export type NotificationFilter =
  | "all"
  | "unread"
  | "critical"
  | "billing"
  | "recommendation";

export interface Notification {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  read: boolean;
  archived: boolean;
  recommendationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsMeta {
  filter: NotificationFilter;
  count: number;
  unreadCount: number;
  lastUpdatedAt: string | null;
}

/** Response `data` shape for GET /api/notifications. */
export interface NotificationsData {
  notifications: Notification[];
  meta: NotificationsMeta;
}
