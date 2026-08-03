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
 * Everything here is scoped to ONE user — notifications are per-user workspace
 * data and must never be reconciled against, or shown to, another user.
 *
 * Dedup is (user, signature)-based: a recurring condition refreshes `updatedAt`
 * instead of creating a duplicate. A genuinely NEW notification emits
 * `notification.created` on the bus, which is the single seam future channels
 * (email/slack/etc.) subscribe to.
 */
import { computeAnalyticsOverview } from "@/services/analytics/analytics.engine";
import { Recommendation } from "@/models/recommendation.model";
import {
  Notification,
  type NotificationSeverity,
  type NotificationCategory,
} from "@/models/notification.model";
import {
  UserSettings,
  DEFAULT_USER_SETTINGS,
  type IUserSettings,
} from "@/models/user-settings.model";
import { eventBus } from "@/services/events/event-bus";
import { emitNotificationCreated } from "@/services/events/notification.events";
import type { Types } from "mongoose";

/** Bound on how many recommendations a single run turns into notifications. */
const REC_SCAN_LIMIT = 50;

/** Resolves the caller's notification preferences, defaulted like the Settings API. */
async function getNotificationPrefs(
  userId: string
): Promise<IUserSettings["notifications"]> {
  const doc = await UserSettings.findOne({ user: userId });
  // `.toObject()` turns the subdocument into a plain object so its real field
  // values (not internal Mongoose getters) merge over the defaults.
  const stored = doc ? (doc.toObject() as IUserSettings).notifications : undefined;
  return { ...DEFAULT_USER_SETTINGS.notifications, ...stored };
}

interface UpsertInput {
  signature: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  recommendationId?: Types.ObjectId;
}

/**
 * Creates or refreshes a notification by (user, signature). Emits
 * `notification.created` ONLY when a new document is inserted (never on a
 * dedup refresh).
 */
export async function upsertNotification(
  userId: string,
  input: UpsertInput
): Promise<{ created: boolean }> {
  const existing = await Notification.findOne({
    user: userId,
    signature: input.signature,
  });
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
    user: userId,
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

/** Human-readable "what happened" copy for the fallback tier, by source+action. */
const CHANGE_COPY: Record<string, { title: string; message: string }> = {
  "billing:create": {
    title: "Billing record added",
    message: "A new billing record was added to your account.",
  },
  "billing:update": {
    title: "Billing record updated",
    message: "One of your billing records was edited.",
  },
  "billing:delete": {
    title: "Billing record removed",
    message: "A billing record was deleted from your account.",
  },
  "platform:create": {
    title: "Platform added",
    message: "A new platform was added to your integrations.",
  },
  "platform:update": {
    title: "Platform updated",
    message: "One of your platforms was edited.",
  },
  "platform:delete": {
    title: "Platform removed",
    message: "A platform was removed from your integrations.",
  },
};

/** Rules driven by a business-data change (analytics-based, no AI). */
export async function runBusinessNotifications(
  userId: string,
  source: string,
  action: string
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled) return;

  const overview = await computeAnalyticsOverview(userId, "all");
  let matched = false;

  const overdue =
    overview.byStatus.find((s) => s.status === "Overdue")?.count ?? 0;
  if (prefs.billingAlerts && overdue > 0) {
    await upsertNotification(userId, {
      signature: "billing:overdue",
      category: "billing",
      severity: "warning",
      title: "Overdue invoices",
      message: `You have ${overdue} overdue invoice${overdue === 1 ? "" : "s"}.`,
    });
    matched = true;
  }

  // High spend concentration — reuse analytics signals (no fixed currency value).
  if (prefs.usageAlerts && overview.primaryCurrency && overview.byPlatform.length > 0) {
    const primary = overview.totalsByCurrency.find(
      (c) => c.currency === overview.primaryCurrency
    );
    const top = overview.byPlatform[0];
    if (primary && primary.total > 0) {
      const share = Math.round((top.total / primary.total) * 100);
      if (share >= prefs.highSpendThreshold) {
        await upsertNotification(userId, {
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

  // Fallback so every business event is always reflected (deduped), with copy
  // specific to what actually changed rather than a generic "data updated".
  if (!matched) {
    const copy = CHANGE_COPY[`${source}:${action}`] ?? {
      title: "Data updated",
      message: `Your ${source} data was updated.`,
    };
    await upsertNotification(userId, {
      signature: "system:data-updated",
      category: "system",
      severity: "info",
      title: copy.title,
      message: copy.message,
    });
  }
}

/** Rules driven by a recommendations refresh (reads the Recommendation collection). */
export async function runRecommendationNotifications(userId: string): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled || !prefs.recommendationAlerts) return;

  const active = await Recommendation.find({
    user: userId,
    status: "active",
  }).limit(REC_SCAN_LIMIT);
  for (const rec of active) {
    await upsertNotification(userId, {
      signature: `rec:new:${rec.signature}`,
      category: "recommendation",
      severity: severityFromRecommendation(rec.severity),
      title: "New recommendation available",
      message: rec.title,
      recommendationId: rec._id,
    });
  }

  const resolved = await Recommendation.find({
    user: userId,
    status: "completed",
  })
    .sort({ updatedAt: -1 })
    .limit(REC_SCAN_LIMIT);
  for (const rec of resolved) {
    await upsertNotification(userId, {
      signature: `rec:resolved:${rec.signature}`,
      category: "recommendation",
      severity: "info",
      title: "Recommendation resolved",
      message: rec.title,
      recommendationId: rec._id,
    });
  }

  await upsertNotification(userId, {
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
 * Events with no known user (shouldn't happen now that webhooks are disabled)
 * are safely skipped — there is nothing to scope the notification to.
 */
export function initNotificationEngine(): void {
  if (initialized) return;
  initialized = true;

  eventBus.subscribe("business.data.changed", (event) => {
    if (!event.triggeredBy) return;
    void runBusinessNotifications(event.triggeredBy, event.source, event.action).catch(
      (e) => logError("business rules", e)
    );
  });

  eventBus.subscribe("recommendations.updated", (event) => {
    void runRecommendationNotifications(event.userId).catch((e) =>
      logError("recommendation rules", e)
    );
  });
}
