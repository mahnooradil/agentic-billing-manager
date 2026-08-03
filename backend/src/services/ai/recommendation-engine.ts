/**
 * Recommendation Engine — Phase F1 (first autonomous AI workflow).
 *
 * Central pipeline: analytics -> AI reasoning -> parse -> reconcile -> persist.
 * It subscribes to `business.data.changed` on the event bus, so it is fully
 * DECOUPLED from the controllers that emit those events (billing/platform now;
 * connectors/schedulers later reuse the same path unchanged).
 *
 * Everything here is scoped to ONE user — recommendations are per-user
 * workspace data and must never be reconciled against another user's billing
 * data or documents.
 *
 * Reconciliation keeps ONE document per (user, signature):
 *  - generated + existing active/completed  -> update in place & (re)activate
 *  - generated + existing dismissed          -> respected (never resurrected)
 *  - generated + new                         -> inserted as active
 *  - active but no longer generated          -> auto-completed (resolvedBy: "ai")
 * Nothing is ever auto-deleted; history is preserved via status + timestamps.
 *
 * Extension points for future engines (Notification/Alert/LangGraph/Automation):
 *  - subscribe to `business.data.changed` to react to the same events
 *  - subscribe to `recommendations.updated` (emitted here) to react to results
 * Cost control: single-flight + trailing PER USER coalesces bursts of events
 * for that same user (a different user's refresh always runs independently),
 * and AI is skipped when there is no data / no AI provider configured.
 */
import { createHash } from "node:crypto";

import { AppError } from "@/utils/appError";
import { runAgentPrompt } from "@/services/agent/managed-agent.service";
import { computeAnalyticsOverview } from "@/services/analytics/analytics.engine";
import { buildRecommendationsPrompt } from "@/utils/ai-recommendations.prompt";
import {
  parseRecommendations,
  type AiRecommendation,
} from "@/utils/ai-recommendations.serializer";
import { Recommendation } from "@/models/recommendation.model";
import { eventBus } from "@/services/events/event-bus";

/** Audit fields recorded on each generated Recommendation. Always the Billing
 *  Advisor Agent now — there is no more per-user provider/model choice. */
const AGENT_META = { provider: "Claude", model: "Billing Advisor Agent" };

export interface ReconcileSummary {
  created: number;
  updated: number;
  autoCompleted: number;
  active: number;
}

export interface RefreshResult {
  status:
    | "ok"
    | "skipped-agent-not-configured"
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

/** Reconciles a freshly generated set against this user's stored recommendations. */
export async function reconcile(
  userId: string,
  parsed: AiRecommendation[],
  meta: { provider?: string; model?: string }
): Promise<ReconcileSummary> {
  const generatedSignatures: string[] = [];
  let created = 0;
  let updated = 0;

  for (const rec of parsed) {
    const signature = signatureFor(rec);
    generatedSignatures.push(signature);

    const existing = await Recommendation.findOne({ user: userId, signature });
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
        user: userId,
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
    user: userId,
    status: "active",
    signature: { $nin: generatedSignatures },
  });
  for (const doc of stale) {
    doc.status = "completed";
    doc.resolvedBy = "ai";
    await doc.save();
  }

  const active = await Recommendation.countDocuments({
    user: userId,
    status: "active",
  });
  return { created, updated, autoCompleted: stale.length, active };
}

/**
 * Runs a full refresh for the given (triggering) user. Awaitable — used by the
 * ops `/refresh` endpoint and by the background scheduler. Skips gracefully when
 * the Billing Advisor Agent isn't configured on this server or there is no
 * billing data yet.
 */
export async function runRefresh(
  userId: string | undefined,
  options: RefreshOptions = {}
): Promise<RefreshResult> {
  if (!userId) return { status: "skipped-agent-not-configured" };

  const overview = await computeAnalyticsOverview(userId, "all");
  if (overview.invoiceCount === 0) return { status: "skipped-no-data" };

  const generate =
    options.generateFn ??
    (async () => {
      const prompt = buildRecommendationsPrompt(overview, "all");
      const reply = await runAgentPrompt(userId, prompt);
      return parseRecommendations(reply);
    });

  let parsed: AiRecommendation[];
  try {
    parsed = await generate();
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 503) {
      return { status: "skipped-agent-not-configured" };
    }
    throw error;
  }
  // Guard: never let an empty/failed parse auto-complete every active rec.
  if (!parsed || parsed.length === 0) return { status: "no-recommendations" };

  const summary = await reconcile(userId, parsed, AGENT_META);

  eventBus.emit({
    type: "recommendations.updated",
    userId,
    summary,
    at: new Date(),
  });
  return { status: "ok", summary };
}

// ── Single-flight + trailing scheduler, PER USER (bounds AI cost under event
// bursts without letting one user's refresh starve another's). ──
interface UserRefreshState {
  running: boolean;
  pending: boolean;
}
const refreshState = new Map<string, UserRefreshState>();

/**
 * Non-blocking refresh request. If a refresh is already running for this user,
 * coalesces into a single trailing run after it finishes. Never throws to the
 * caller. A no-op when `userId` is undefined (nothing to scope the refresh to).
 */
export async function scheduleRefresh(userId: string | undefined): Promise<void> {
  if (!userId) return;

  const state = refreshState.get(userId) ?? { running: false, pending: false };
  refreshState.set(userId, state);

  if (state.running) {
    state.pending = true;
    return;
  }
  state.running = true;
  try {
    for (;;) {
      state.pending = false;
      try {
        await runRefresh(userId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[recommendation-engine] refresh failed: ${message}`);
      }
      if (!state.pending) break;
    }
  } finally {
    state.running = false;
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
