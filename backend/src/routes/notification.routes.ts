import { Router } from "express";

import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
} from "@/controllers/notification.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

// All notification endpoints require a valid Bearer token.
router.use(authenticate);

router.get("/", listNotifications);
// Static paths must be registered before the "/:id/..." param routes.
router.get("/unread-count", getUnreadCount);
router.patch("/mark-all-read", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);
router.patch("/:id/archive", archiveNotification);

export default router;
