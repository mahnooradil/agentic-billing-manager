/**
 * Notification event helpers — Phase F2.
 *
 * The Notification Engine emits `notification.created` on the shared event bus
 * whenever a NEW notification is persisted (not on dedup refreshes). This is the
 * SINGLE seam future notification channels subscribe to:
 *
 *   eventBus.subscribe("notification.created", (e) => sendEmail/slack/discord…)
 *
 * Future integrations plug in here without touching Billing, the Recommendation
 * Engine, or this phase's code.
 */
import { eventBus } from "@/services/events/event-bus";
import type { NotificationDocument } from "@/models/notification.model";

/** Publishes a notification-created event for downstream channels. */
export function emitNotificationCreated(doc: NotificationDocument): void {
  eventBus.emit({
    type: "notification.created",
    notificationId: doc._id.toString(),
    severity: doc.severity,
    category: doc.category,
    title: doc.title,
    at: new Date(),
  });
}
