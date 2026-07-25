/**
 * Notification Engine — Phase F2 (Autonomous Alerts).
 *
 * Subscribes to the event bus and turns aggregated signals into persistent
 * notifications. It performs NO AI/provider calls and reads NO PII — it consumes
 * the Analytics Engine output and the Recommendation collection only.
 *
 *   business.data.changed  -> analytics rules (overdue, high spend, else "updated")
 *   recommendations.updated -> recommendation rules (new / resolved / critical)
 *
 * Dedup is signature-based (one document per signature): a recurring condition
 * refreshes `updatedAt` instead of creating a duplicate. A genuinely NEW
 * notification emits `notification.created` on the bus, which is the single seam
 * future channels (email/slack/etc.) subscribe to.
 */
import { computeAnalyticsOverview } from "@/services/analytics/analytics.engine";
import { Recommendation } from "@/models/recommendation.model";
import {
  Notification,
  type NotificationSeverity,
  type NotificationCategory,
} from "@/models/notification.model";
import { eventBus } from "@/services/events/event-bus";
import { emitNotificationCreated } from "@/services/events/notification.events";
import type { Types } from "mongoose";

/** Spend share (%) of the primary currency that counts as "high concentration". */
const HIGH_SPEND_SHARE = 60;
/** Bound on how many recommendations a single run turns into notifications. */
const REC_SCAN_LIMIT = 50;

interface UpsertInput {
  signature: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  recommendationId?: Types.ObjectId;
}

/**
 * Creates or refreshes a notification by signature. Emits `notification.created`
 * ONLY when a new document is inserted (never on a dedup refresh).
 */
export async function upsertNotification(
  input: UpsertInput
): Promise<{ created: boolean }> {
  const existing = await Notification.findOne({ signature: input.signature });
  if (existing) {
    // updateOne (not save) so `updatedAt` always refreshes via the timestamps
    // plugin — even when the content is unchanged (dedup = refresh, not a no-op).
    await Notification.updateOne(
      { _id: existing._id },
      {
        $set: {
          title: input.title,
          message: input.message,
          severity: input.severity,
          category: input.category,
          ...(input.recommendationId
            ? { recommendationId: input.recommendationId }
            : {}),
        },
      }
    );
    return { created: false };
  }

  const doc = await Notification.create({
    title: input.title,
    message: input.message,
    severity: input.severity,
    category: input.category,
    signature: input.signature,
    recommendationId: input.recommendationId,
    read: false,
    archived: false,
    source: "notification-engine",
  });
  emitNotificationCreated(doc);
  return { created: true };
}

/** Maps a recommendation severity to a notification severity. */
function severityFromRecommendation(sev: string): NotificationSeverity {
  if (sev === "high") return "critical";
  if (sev === "medium") return "warning";
  return "info";
}

/** Rules driven by a business-data change (analytics-based, no AI). */
export async function runBusinessNotifications(source: string): Promise<void> {
  const overview = await computeAnalyticsOverview("all");
  let matched = false;

  const overdue =
    overview.byStatus.find((s) => s.status === "Overdue")?.count ?? 0;
  if (overdue > 0) {
    await upsertNotification({
      signature: "billing:overdue",
      category: "billing",
      severity: "warning",
      title: "Overdue invoices",
      message: `You have ${overdue} overdue invoice${overdue === 1 ? "" : "s"}.`,
    });
    matched = true;
  }

  // High spend concentration — reuse analytics signals (no fixed currency value).
  if (overview.primaryCurrency && overview.byPlatform.length > 0) {
    const primary = overview.totalsByCurrency.find(
      (c) => c.currency === overview.primaryCurrency
    );
    const top = overview.byPlatform[0];
    if (primary && primary.total > 0) {
      const share = Math.round((top.total / primary.total) * 100);
      if (share >= HIGH_SPEND_SHARE) {
        await upsertNotification({
          signature: "usage:concentration",
          category: "usage",
          severity: "info",
          title: "High spend concentration",
          message: `${top.name} accounts for ${share}% of your ${primary.currency} spend.`,
        });
        matched = true;
      }
    }
  }

  // Fallback so every business event is always reflected (deduped).
  if (!matched) {
    await upsertNotification({
      signature: "system:data-updated",
      category: "system",
      severity: "info",
      title: "Data updated",
      message: `Your ${source} data was updated.`,
    });
  }
}

/** Rules driven by a recommendations refresh (reads the Recommendation collection). */
export async function runRecommendationNotifications(): Promise<void> {
  const active = await Recommendation.find({ status: "active" }).limit(
    REC_SCAN_LIMIT
  );
  for (const rec of active) {
    await upsertNotification({
      signature: `rec:new:${rec.signature}`,
      category: "recommendation",
      severity: severityFromRecommendation(rec.severity),
      title: "New recommendation available",
      message: rec.title,
      recommendationId: rec._id,
    });
  }

  const resolved = await Recommendation.find({ status: "completed" })
    .sort({ updatedAt: -1 })
    .limit(REC_SCAN_LIMIT);
  for (const rec of resolved) {
    await upsertNotification({
      signature: `rec:resolved:${rec.signature}`,
      category: "recommendation",
      severity: "info",
      title: "Recommendation resolved",
      message: rec.title,
      recommendationId: rec._id,
    });
  }

  await upsertNotification({
    signature: "system:ai-analysis",
    category: "system",
    severity: "info",
    title: "AI analysis completed",
    message: "Your recommendations were refreshed.",
  });
}

function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[notification-engine] ${context} failed: ${message}`);
}

let initialized = false;

/**
 * Wires the engine to the event bus. Called once at startup. Idempotent. Both
 * handlers are fire-and-forget so they never block the request that emitted.
 */
export function initNotificationEngine(): void {
  if (initialized) return;
  initialized = true;

  eventBus.subscribe("business.data.changed", (event) => {
    void runBusinessNotifications(event.source).catch((e) =>
      logError("business rules", e)
    );
  });

  eventBus.subscribe("recommendations.updated", () => {
    void runRecommendationNotifications().catch((e) =>
      logError("recommendation rules", e)
    );
  });
}
