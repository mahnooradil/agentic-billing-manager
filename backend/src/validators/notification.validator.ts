/**
 * Zod schema for the notification list query (Phase F2). Read + lifecycle
 * endpoints are param-based, so only the list filter needs validation.
 */
import { z } from "zod";

/** UI filters for GET /api/notifications. */
export const NOTIFICATION_FILTERS = [
  "all",
  "unread",
  "critical",
  "billing",
  "recommendation",
] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export const listNotificationsQuerySchema = z.object({
  filter: z.enum(NOTIFICATION_FILTERS).catch("all").default("all"),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
