/**
 * Notification controller — Phase F2.
 *
 * Read + lifecycle endpoints over the persistent Notification collection.
 * Generation is autonomous (Notification Engine); this layer never generates.
 * Archived notifications are hidden from the lists but preserved (no delete).
 * All routes are protected by `authenticate`, and every query is scoped to the
 * authenticated user's organization (shared across every member).
 */
import { isValidObjectId, type Types } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicNotification } from "@/utils/notification.serializer";
import { Notification } from "@/models/notification.model";
import { listNotificationsQuerySchema } from "@/validators/notification.validator";

/** Builds the Mongo filter for a UI filter value (archived always excluded). */
function filterToQuery(
  organizationId: Types.ObjectId,
  filter: string
): Record<string, unknown> {
  const base = { organization: organizationId, archived: false };
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
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const { filter } = listNotificationsQuerySchema.parse(req.query);

  const [docs, unreadCount] = await Promise.all([
    Notification.find(filterToQuery(organization._id, filter))
      .sort({ updatedAt: -1 })
      .limit(100),
    Notification.countDocuments({
      organization: organization._id,
      read: false,
      archived: false,
    }),
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
export const getUnreadCount = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const unreadCount = await Notification.countDocuments({
    organization: organization._id,
    read: false,
    archived: false,
  });
  sendSuccess(res, 200, "Unread count retrieved", { unreadCount });
});

/** Loads a notification by id, scoped to its organization, or throws a 404 (also for malformed ids). */
async function findNotificationOr404(id: string, organizationId: Types.ObjectId) {
  if (!isValidObjectId(id)) {
    throw new AppError("Notification not found", 404);
  }
  const doc = await Notification.findOne({ _id: id, organization: organizationId });
  if (!doc) {
    throw new AppError("Notification not found", 404);
  }
  return doc;
}

/** PATCH /api/notifications/:id/read */
export const markNotificationRead = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const doc = await findNotificationOr404(req.params.id as string, organization._id);
  doc.read = true;
  await doc.save();
  sendSuccess(res, 200, "Notification marked as read", {
    notification: toPublicNotification(doc),
  });
});

/** PATCH /api/notifications/mark-all-read */
export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const result = await Notification.updateMany(
    { organization: organization._id, read: false, archived: false },
    { $set: { read: true } }
  );
  sendSuccess(res, 200, "All notifications marked as read", {
    modified: result.modifiedCount,
  });
});

/** PATCH /api/notifications/:id/archive */
export const archiveNotification = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const doc = await findNotificationOr404(req.params.id as string, organization._id);
  doc.archived = true;
  doc.read = true;
  await doc.save();
  sendSuccess(res, 200, "Notification archived", {
    notification: toPublicNotification(doc),
  });
});
