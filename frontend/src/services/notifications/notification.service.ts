/**
 * Notification service — reads notifications + unread count and updates the
 * read/archive lifecycle. Goes through the shared authed `api` client. There is
 * no "generate" call — notifications are produced autonomously on the backend.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  Notification,
  NotificationFilter,
  NotificationsData,
} from "@/services/types/notifications";

/** GET /notifications?filter=… */
export function getNotifications(
  filter: NotificationFilter = "all"
): Promise<ApiSuccess<NotificationsData>> {
  return api.get<ApiSuccess<NotificationsData>>(
    `/notifications?filter=${encodeURIComponent(filter)}`
  );
}

/** GET /notifications/unread-count */
export function getUnreadCount(): Promise<ApiSuccess<{ unreadCount: number }>> {
  return api.get<ApiSuccess<{ unreadCount: number }>>(
    "/notifications/unread-count"
  );
}

/** PATCH /notifications/:id/read */
export function markNotificationRead(
  id: string
): Promise<ApiSuccess<{ notification: Notification }>> {
  return api.patch<ApiSuccess<{ notification: Notification }>>(
    `/notifications/${id}/read`,
    {}
  );
}

/** PATCH /notifications/mark-all-read */
export function markAllNotificationsRead(): Promise<
  ApiSuccess<{ modified: number }>
> {
  return api.patch<ApiSuccess<{ modified: number }>>(
    "/notifications/mark-all-read",
    {}
  );
}

/** PATCH /notifications/:id/archive */
export function archiveNotification(
  id: string
): Promise<ApiSuccess<{ notification: Notification }>> {
  return api.patch<ApiSuccess<{ notification: Notification }>>(
    `/notifications/${id}/archive`,
    {}
  );
}
