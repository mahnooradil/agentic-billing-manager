/**
 * Notification controller — Phase F2.
 *
 * Read + lifecycle endpoints over the persistent Notification collection.
 * Generation is autonomous (Notification Engine); this layer never generates.
 * Archived notifications are hidden from the lists but preserved (no delete).
 * All routes are protected by `authenticate`.
 */
import { isValidObjectId } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicNotification } from "@/utils/notification.serializer";
import { Notification } from "@/models/notification.model";
import { listNotificationsQuerySchema } from "@/validators/notification.validator";

/** Builds the Mongo filter for a UI filter value (archived always excluded). */
function filterToQuery(filter: string): Record<string, unknown> {
  const base = { archived: false };
  switch (filter) {
    case "unread":
      return { ...base, read: false };
    case "critical":
      return { ...base, severity: "critical" };
    case "billing":
      return { ...base, category: "billing" };
    case "recommendation":
      return { ...base, category: "recommendation" };
    default:
      return base;
  }
}

/** GET /api/notifications?filter=all|unread|critical|billing|recommendation */
export const listNotifications = asyncHandler(async (req, res) => {
  const { filter } = listNotificationsQuerySchema.parse(req.query);

  const [docs, unreadCount] = await Promise.all([
    Notification.find(filterToQuery(filter)).sort({ updatedAt: -1 }).limit(100),
    Notification.countDocuments({ read: false, archived: false }),
  ]);

  const notifications = docs.map(toPublicNotification);
  const lastUpdatedAt =
    notifications.length > 0 ? notifications[0].updatedAt : null;

  sendSuccess(res, 200, "Notifications retrieved", {
    notifications,
    meta: { filter, count: notifications.length, unreadCount, lastUpdatedAt },
  });
});

/** GET /api/notifications/unread-count */
export const getUnreadCount = asyncHandler(async (_req, res) => {
  const unreadCount = await Notification.countDocuments({
    read: false,
    archived: false,
  });
  sendSuccess(res, 200, "Unread count retrieved", { unreadCount });
});

/** Loads a notification by id or throws a 404 (also for malformed ids). */
async function findNotificationOr404(id: string) {
  if (!isValidObjectId(id)) {
    throw new AppError("Notification not found", 404);
  }
  const doc = await Notification.findById(id);
  if (!doc) {
    throw new AppError("Notification not found", 404);
  }
  return doc;
}

/** PATCH /api/notifications/:id/read */
export const markNotificationRead = asyncHandler(async (req, res) => {
  const doc = await findNotificationOr404(req.params.id as string);
  doc.read = true;
  await doc.save();
  sendSuccess(res, 200, "Notification marked as read", {
    notification: toPublicNotification(doc),
  });
});

/** PATCH /api/notifications/mark-all-read */
export const markAllNotificationsRead = asyncHandler(async (_req, res) => {
  const result = await Notification.updateMany(
    { read: false, archived: false },
    { $set: { read: true } }
  );
  sendSuccess(res, 200, "All notifications marked as read", {
    modified: result.modifiedCount,
  });
});

/** PATCH /api/notifications/:id/archive */
export const archiveNotification = asyncHandler(async (req, res) => {
  const doc = await findNotificationOr404(req.params.id as string);
  doc.archived = true;
  doc.read = true;
  await doc.save();
  sendSuccess(res, 200, "Notification archived", {
    notification: toPublicNotification(doc),
  });
});
