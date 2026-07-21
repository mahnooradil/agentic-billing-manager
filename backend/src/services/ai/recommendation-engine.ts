/**
 * Recommendation Engine — Phase F1 (first autonomous AI workflow).
 *
 * Central pipeline: analytics -> AI reasoning -> parse -> reconcile -> persist.
 * It subscribes to `business.data.changed` on the event bus, so it is fully
 * DECOUPLED from the controllers that emit those events (billing/platform now;
 * webhooks/connectors/schedulers later reuse the same path unchanged).
 *
 * Reconciliation keeps ONE document per signature:
 *  - generated + existing active/completed  -> update in place & (re)activate
 *  - generated + existing dismissed          -> respected (never resurrected)
 *  - generated + new                         -> inserted as active
 *  - active but no longer generated          -> auto-completed (resolvedBy: "ai")
 * Nothing is ever auto-deleted; history is preserved via status + timestamps.
 *
 * Extension points for future engines (Notification/Alert/LangGraph/Automation):
 *  - subscribe to `business.data.changed` to react to the same events
 *  - subscribe to `recommendations.updated` (emitted here) to react to results
 * Cost control: single-flight + trailing run coalesces bursts of events, and AI
 * is skipped when there is no data / no AI provider configured.
 */
import { createHash } from "node:crypto";

import { decryptSecret } from "@/utils/crypto";
import { generateChatCompletion } from "@/utils/ai-provider";
import { computeAnalyticsOverview } from "@/services/analytics/analytics.engine";
import { buildRecommendationsPrompt } from "@/utils/ai-recommendations.prompt";
import {
  parseRecommendations,
  type AiRecommendation,
} from "@/utils/ai-recommendations.serializer";
import { AiSettings } from "@/models/ai-settings.model";
import { Recommendation } from "@/models/recommendation.model";
import { eventBus } from "@/services/events/event-bus";

export interface ReconcileSummary {
  created: number;
  updated: number;
  autoCompleted: number;
  active: number;
}

export interface RefreshResult {
  status:
    | "ok"
    | "skipped-no-settings"
    | "skipped-no-data"
    | "no-recommendations";
  summary?: ReconcileSummary;
}

/** Options for a refresh. `generateFn` lets tests inject AI output. */
export interface RefreshOptions {
  generateFn?: () => Promise<AiRecommendation[]>;
}

/** Stable identity for a recommendation — hash of category + normalized title. */
export function signatureFor(rec: {
  category: string;
  title: string;
}): string {
  const basis = `${rec.category.toLowerCase().trim()}|${rec.title
    .toLowerCase()
    .trim()}`;
  return createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

/** Reconciles a freshly generated set against the stored recommendations. */
export async function reconcile(
  parsed: AiRecommendation[],
  meta: { provider?: string; model?: string }
): Promise<ReconcileSummary> {
  const generatedSignatures: string[] = [];
  let created = 0;
  let updated = 0;

  for (const rec of parsed) {
    const signature = signatureFor(rec);
    generatedSignatures.push(signature);

    const existing = await Recommendation.findOne({ signature });
    if (existing) {
      // Respect a user's dismissal — never resurrect a dismissed rec.
      if (existing.status === "dismissed") continue;

      // `.set()` avoids the Mongoose Document.model() name clash on the `model`
      // field while updating every field in one call.
      existing.set({
        title: rec.title,
        detail: rec.detail,
        severity: rec.severity,
        category: rec.category,
        suggestedAction: rec.suggestedAction,
        status: "active",
        resolvedBy: null,
        source: "auto",
        provider: meta.provider,
        model: meta.model,
      });
      await existing.save();
      updated++;
    } else {
      await Recommendation.create({
        title: rec.title,
        detail: rec.detail,
        severity: rec.severity,
        category: rec.category,
        suggestedAction: rec.suggestedAction,
        signature,
        status: "active",
        source: "auto",
        resolvedBy: null,
        provider: meta.provider,
        model: meta.model,
        generatedAt: new Date(),
      });
      created++;
    }
  }

  // Auto-complete active recs the AI no longer considers applicable.
  const stale = await Recommendation.find({
    status: "active",
    signature: { $nin: generatedSignatures },
  });
  for (const doc of stale) {
    doc.status = "completed";
    doc.resolvedBy = "ai";
    await doc.save();
  }

  const active = await Recommendation.countDocuments({ status: "active" });
  return { created, updated, autoCompleted: stale.length, active };
}

/**
 * Runs a full refresh for the given (triggering) user. Awaitable — used by the
 * ops `/refresh` endpoint and by the background scheduler. Skips gracefully when
 * the user has no AI provider configured or there is no billing data.
 */
export async function runRefresh(
  userId: string | undefined,
  options: RefreshOptions = {}
): Promise<RefreshResult> {
  if (!userId) return { status: "skipped-no-settings" };

  const settings = await AiSettings.findOne({ user: userId }).select("+apiKey");
  if (!settings) return { status: "skipped-no-settings" };

  const overview = await computeAnalyticsOverview("all");
  if (overview.invoiceCount === 0) return { status: "skipped-no-data" };

  const generate =
    options.generateFn ??
    (async () => {
      const apiKey = decryptSecret(settings.apiKey);
      const prompt = buildRecommendationsPrompt(overview, "all");
      const reply = await generateChatCompletion({
        provider: settings.provider,
        model: settings.model,
        apiKey,
        messages: [{ role: "user", content: prompt }],
      });
      return parseRecommendations(reply);
    });

  const parsed = await generate();
  // Guard: never let an empty/failed parse auto-complete every active rec.
  if (!parsed || parsed.length === 0) return { status: "no-recommendations" };

  const summary = await reconcile(parsed, {
    provider: settings.provider,
    model: settings.model,
  });

  eventBus.emit({ type: "recommendations.updated", summary, at: new Date() });
  return { status: "ok", summary };
}

// ── Single-flight + trailing scheduler (bounds AI cost under event bursts) ──
let running = false;
let pending = false;
let pendingUser: string | undefined;

/**
 * Non-blocking refresh request. If a refresh is already running, coalesces into
 * a single trailing run after it finishes. Never throws to the caller.
 */
export async function scheduleRefresh(userId: string | undefined): Promise<void> {
  if (running) {
    pending = true;
    pendingUser = userId;
    return;
  }
  running = true;
  try {
    let uid = userId;
    for (;;) {
      pending = false;
      try {
        await runRefresh(uid);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[recommendation-engine] refresh failed: ${message}`);
      }
      if (!pending) break;
      uid = pendingUser;
    }
  } finally {
    running = false;
  }
}

let initialized = false;

/**
 * Wires the engine to the event bus. Called once at server startup. Idempotent.
 * The business-data-changed handler is fire-and-forget so it never blocks the
 * request that emitted the event.
 */
export function initRecommendationEngine(): void {
  if (initialized) return;
  initialized = true;
  eventBus.subscribe("business.data.changed", (event) => {
    void scheduleRefresh(event.triggeredBy);
  });
}
