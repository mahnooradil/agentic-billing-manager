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
import { Billing, type BillingDocument } from "@/models/billing.model";
import { Recommendation } from "@/models/recommendation.model";
import { Platform } from "@/models/platform.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { User } from "@/models/user.model";
import { sendDueDateReminderEmail } from "@/services/email/resend";
import { sendSlackAlert } from "@/services/notifications/slack";
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
import { eventBus, emitBusinessDataChanged } from "@/services/events/event-bus";
import { emitNotificationCreated } from "@/services/events/notification.events";
import { getOrganizationIdForUser } from "@/services/organizations/membership-lookup.service";
import type { Types } from "mongoose";

/** Bound on how many recommendations a single run turns into notifications. */
const REC_SCAN_LIMIT = 50;

/** Resolves the caller's notification preferences, defaulted like the Settings API.
 *  Exported so other services (e.g. email-sync) can gate their own one-off
 *  alerts on the same preferences instead of re-reading UserSettings themselves. */
export async function getNotificationPrefs(
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
 * Creates or refreshes a notification by (organization, signature). Emits
 * `notification.created` ONLY when a new document is inserted (never on a
 * dedup refresh).
 */
export async function upsertNotification(
  organizationId: string,
  input: UpsertInput
): Promise<{ created: boolean }> {
  const existing = await Notification.findOne({
    organization: organizationId,
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
    organization: organizationId,
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

/** Rules driven by a business-data change (analytics-based, no AI). Notification
 *  data is organization-scoped, but preferences (enabled/thresholds) are still
 *  read from the triggering user's own settings — an accepted v1 simplification
 *  since notification preferences haven't moved to the organization yet. */
export async function runBusinessNotifications(
  userId: string,
  source: string,
  action: string
): Promise<void> {
  const organizationId = await getOrganizationIdForUser(userId);
  if (!organizationId) return;
  const organizationIdStr = organizationId.toString();

  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled) return;

  const overview = await computeAnalyticsOverview(organizationIdStr, "all");
  let matched = false;

  const overdue =
    overview.byStatus.find((s) => s.status === "Overdue")?.count ?? 0;
  if (prefs.billingAlerts && overdue > 0) {
    await upsertNotification(organizationIdStr, {
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
        await upsertNotification(organizationIdStr, {
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
    await upsertNotification(organizationIdStr, {
      signature: "system:data-updated",
      category: "system",
      severity: "info",
      title: copy.title,
      message: copy.message,
    });
  }
}

/** How recently a recommendation must have changed to count as part of THIS
 *  refresh's notification batch — generous enough to cover the reconcile
 *  pass's own runtime, tight enough to never pull in old, already-notified
 *  activity from an earlier refresh. */
const RECOMMENDATION_BATCH_WINDOW_MS = 2 * 60_000;

/** Deterministic signature for a batch notification — the same set of
 *  recommendation ids always dedupes to the same row (via `upsertNotification`)
 *  instead of creating a duplicate if this ever runs twice for one event. */
function batchSignature(prefix: string, ids: Types.ObjectId[]): string {
  return `${prefix}:${ids.map((id) => id.toString()).sort().join(",")}`;
}

/** Notifies about a set of recommendations that changed together in one
 *  refresh — a single item gets its own specific row; several at once (e.g.
 *  one invoice payment resolving multiple flags together) are collapsed into
 *  ONE summary notification instead of flooding the panel with a row each. */
async function notifyRecommendationBatch(
  organizationId: string,
  items: Array<{ _id: Types.ObjectId; title: string; signature: string; severity: string }>,
  copy: { signaturePrefix: string; singleTitle: string; batchTitle: (count: number) => string }
): Promise<void> {
  if (items.length === 0) return;

  if (items.length === 1) {
    const rec = items[0];
    await upsertNotification(organizationId, {
      signature: `${copy.signaturePrefix}:${rec.signature}`,
      category: "recommendation",
      severity: severityFromRecommendation(rec.severity),
      title: copy.singleTitle,
      message: rec.title,
      recommendationId: rec._id,
    });
    return;
  }

  const preview = items.slice(0, 3).map((r) => r.title).join("; ");
  const extra = items.length > 3 ? `; +${items.length - 3} more` : "";
  await upsertNotification(organizationId, {
    signature: batchSignature(`${copy.signaturePrefix}-batch`, items.map((r) => r._id)),
    category: "recommendation",
    severity: severityFromRecommendation(items[0].severity),
    title: copy.batchTitle(items.length),
    message: `${preview}${extra}`,
  });
}

/** Rules driven by a recommendations refresh (reads the Recommendation
 *  collection). `organizationId` comes straight from the triggering event —
 *  no extra lookup needed there; `userId` is still used for preferences. */
export async function runRecommendationNotifications(
  userId: string,
  organizationId: string
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled || !prefs.recommendationAlerts) return;

  const since = new Date(Date.now() - RECOMMENDATION_BATCH_WINDOW_MS);

  const newActive = await Recommendation.find({
    organization: organizationId,
    status: "active",
    updatedAt: { $gte: since },
  })
    .sort({ updatedAt: -1 })
    .limit(REC_SCAN_LIMIT);
  await notifyRecommendationBatch(organizationId, newActive, {
    signaturePrefix: "rec:new",
    singleTitle: "New recommendation available",
    batchTitle: (n) => `${n} new recommendations`,
  });

  const resolved = await Recommendation.find({
    organization: organizationId,
    status: "completed",
    resolvedBy: "ai",
    updatedAt: { $gte: since },
  })
    .sort({ updatedAt: -1 })
    .limit(REC_SCAN_LIMIT);
  await notifyRecommendationBatch(organizationId, resolved, {
    signaturePrefix: "rec:resolved",
    singleTitle: "Recommendation resolved",
    batchTitle: (n) => `${n} recommendations resolved`,
  });

  await upsertNotification(organizationId, {
    signature: "system:ai-analysis",
    category: "system",
    severity: "info",
    title: "AI analysis completed",
    message: "Your recommendations were refreshed.",
  });
}

/** How far ahead of a due date to start warning. */
const DUE_SOON_WINDOW_DAYS = 3;

/** The vendor/platform name for a billing record — a manual record links a
 *  `Platform` doc directly, an auto/email-synced one links a
 *  `PlatformConnection` instead (see billing.model.ts's docstring on why
 *  it's exactly one of the two). `vendorName` (set by email-sync's AI
 *  extraction — see billing.serializer.ts's identical preference) takes
 *  priority for a connection-based record: one Gmail connection can cover
 *  many vendors (Netflix, Spotify, ...), so the connection's own name
 *  ("Gmail") is a worse answer than the specific vendor when one was
 *  captured. Falls back to null rather than guessing when nothing resolves
 *  (shouldn't happen given the model's own pre-validate invariant, but never
 *  worth a thrown error over). */
async function resolvePlatformName(
  record: Pick<BillingDocument, "platform" | "platformConnection" | "vendorName">
): Promise<string | null> {
  if (record.platform) {
    const platform = await Platform.findById(record.platform).select("name");
    return platform?.name ?? null;
  }
  if (record.platformConnection) {
    if (record.vendorName) return record.vendorName;
    const connection = await PlatformConnection.findById(record.platformConnection).select(
      "displayName"
    );
    return connection?.displayName ?? null;
  }
  return null;
}

/**
 * "Payment due soon" rule — unlike the rules above, this isn't triggered by a
 * business-data change; a due date approaches purely because TIME passed, so
 * it's driven by its own scheduler (due-date-scheduler.ts) instead of the
 * event bus. Scans across every organization in one pass (there's no
 * triggering user/org to scope to), checking each matched record's OWN
 * creator's notification preferences — the same v1 simplification the rules
 * above already use (prefs are per-user, not yet per-organization).
 *
 * Re-running this daily naturally ESCALATES the same notification's severity
 * as the due date gets closer (upsertNotification refreshes severity on a
 * dedup hit) rather than creating a new one each time.
 */
export async function runDueDateNotifications(): Promise<void> {
  const now = new Date();
  const threshold = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * 86_400_000);

  const dueSoon = await Billing.find({
    dueDate: { $exists: true, $gte: now, $lte: threshold },
    status: { $ne: "Paid" },
  }).select(
    "organization user customerName amount currency dueDate platform platformConnection vendorName"
  );

  for (const record of dueSoon) {
    try {
      const prefs = await getNotificationPrefs(record.user.toString());
      if (!prefs.enabled || !prefs.billingAlerts) continue;

      const daysUntilDue = Math.max(
        0,
        Math.ceil((record.dueDate!.getTime() - now.getTime()) / 86_400_000)
      );
      const dueLabel =
        daysUntilDue === 0 ? "today" : daysUntilDue === 1 ? "tomorrow" : `in ${daysUntilDue} days`;
      const severity: NotificationSeverity = daysUntilDue <= 1 ? "critical" : "warning";
      const platformName = await resolvePlatformName(record);
      const message = platformName
        ? `${platformName} — ${record.customerName}'s ${record.amount} ${record.currency} invoice is due ${dueLabel}.`
        : `${record.customerName}'s ${record.amount} ${record.currency} invoice is due ${dueLabel}.`;

      const { created } = await upsertNotification(record.organization.toString(), {
        signature: `billing:due-soon:${record._id.toString()}`,
        category: "billing",
        severity,
        title: "Payment due soon",
        message,
      });

      // Email/Slack only on the FIRST time this invoice enters the warning
      // window (a fresh insert, not a daily dedup refresh) — one heads-up,
      // not a repeat every time the scheduler re-runs while it's still unpaid.
      if (created) {
        const user = await User.findById(record.user).select("email");
        if (user) {
          await sendDueDateReminderEmail({
            to: user.email,
            platformName,
            customerName: record.customerName,
            amount: record.amount,
            currency: record.currency,
            dueDate: record.dueDate!,
            dueLabel,
            isUrgent: severity === "critical",
          }).catch((e) => logError("due-date email", e));
        }

        if (prefs.slackWebhookUrl) {
          await sendSlackAlert(
            prefs.slackWebhookUrl,
            `:warning: *Payment due ${dueLabel}* — ${message}`
          ).catch((e) => logError("due-date slack", e));
        }
      }
    } catch (e) {
      logError("due-date rule (one record)", e);
    }
  }
}

/**
 * Auto-flips a "Pending" record to "Overdue" once its due date has passed.
 * Nothing else in the app does this: billing-sync/email-sync only ever set
 * status from what the source itself reports, and a manually-dated record
 * would otherwise sit at "Pending" forever after its due date with nothing
 * ever correcting it. Runs alongside `runDueDateNotifications` (same
 * scheduler, since both react to time passing rather than a data change).
 *
 * Re-emits `business.data.changed` per affected user so the existing
 * overdue-count notification rule (`runBusinessNotifications`) picks up the
 * new total on its own, instead of duplicating that logic here.
 */
export async function autoMarkOverdue(): Promise<void> {
  const now = new Date();
  const toFlip = await Billing.find({
    dueDate: { $exists: true, $lt: now },
    status: "Pending",
  }).select("_id user");

  if (toFlip.length === 0) return;

  await Billing.updateMany(
    { _id: { $in: toFlip.map((r) => r._id) } },
    { $set: { status: "Overdue" } }
  );

  const notifiedUsers = new Set<string>();
  for (const record of toFlip) {
    const userId = record.user.toString();
    if (notifiedUsers.has(userId)) continue;
    notifiedUsers.add(userId);
    emitBusinessDataChanged({ source: "billing", action: "update", triggeredBy: userId });
  }
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
    void runRecommendationNotifications(event.userId, event.organizationId).catch((e) =>
      logError("recommendation rules", e)
    );
  });
}
