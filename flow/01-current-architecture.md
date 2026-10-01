# Flow for Document 01 — Current Architecture (As Built)

**Read:** in full, line by line (all 11 diagrams/tables). **Inspected against live code:** yes, on
2026-09-23 — every ⚠️-flagged claim below was checked by reading the exact file/line, not assumed.

This document is mostly diagrams of the *existing* system rather than new prescriptive requirements
— most of its ⚠️ warnings are **the same underlying bugs already captured in
[`flow/00-executive-summary.md`](00-executive-summary.md)** (indexes, OTP, sync loop, Stripe). Those
are **not repeated here**. Below is only what is genuinely new evidence or a genuinely new item not
already tracked.

---

## Genuinely new action items (not in doc 00)

### Agent orchestration (§4 of this document) — none of this was in doc 00

1. ✅ **DONE (2026-10-01, WP-7) — No `MAX_ITERATIONS` anywhere in `managed-agent.service.ts`.**
   Confirmed by direct search before fixing — no match at all, the tool-call loop could run
   unbounded. Fixed with a two-tier cap (`MAX_TOOL_ITERATIONS_SOFT = 8`, matching the roadmap's own
   suggested value, `MAX_TOOL_ITERATIONS_HARD = 12`): past the soft limit, the agent is told via an
   error tool result to wrap up with what it has (a real chance at a normal reply, not an abrupt
   cutoff); past the hard limit, the loop stops reading the stream at all regardless of what the
   model does next — a real ceiling no model behavior can exceed. Full detail in
   `flow/00-executive-summary.md` item #9c.
2. **`void consumeCredits(...)` fire-and-forget in two places** — re-examined, not a bug: the
   code's own comment ("actual cost is only known once it's done") is correct — token usage is
   genuinely unknowable until the turn completes, so deferred, best-effort billing here is the
   deliberate design, not an oversight. Left unchanged.
3. ✅ **DONE (Task 9, 2026-09-27) — Tool results are raw-`JSON.stringify`'d into the agent's
   context.** Already fixed before this WP-7 pass even started — `sanitizeForAgentContext()` now
   runs on every tool result before it's stringified. Confirmed still in place while reading this
   file during WP-7.
4. ✅ **DONE (2026-10-01, WP-7) — `AgentSession` had a unique index on `user` only.** Re-keyed to a
   compound `{user, organization}` unique index — see `flow/00-executive-summary.md` item #9c for
   the full change (model, service functions, every call site, the live-DB index migration).
5. **`getOrganizationIdForUser(userId)` is a genuinely separate, independent tenancy-resolution
   path** from `req.organization`, also used outside the agent (`notification-engine.ts:160`,
   recommendation-engine.ts, and every agent tool). **Deliberately NOT touched in this pass** — on
   inspection, every real call site is a background job or an agent-tool call that only ever
   receives a bare `userId` string, with no HTTP request (and so no `req.organization`) in scope at
   all; this isn't two competing sources of truth so much as the only available one in those
   contexts. The theoretical risk CLAUDE.md §10.6 flags (a concurrent org-switch race causing a
   mid-request divergence) would need threading `organizationId` through every agent tool's
   signature to close — a materially larger, more invasive change than this pass's two concrete,
   already-confirmed bugs, for a risk explicitly described there as "not yet broken." Left as an
   explicitly deferred item, not silently dropped.
   agent's.

### Credit metering (§7) — new specifics beyond doc 00's "annual not monthly" bug

6. **`tokensToCredits(inputTokens, outputTokens)` — confirmed to take only these two parameters.**
   No prompt-cache token accounting, no Managed Agents session-hour accounting anywhere in
   `config/credits.ts`. Credits are structurally under-metered against what Anthropic actually
   bills, independent of the cycle-length bug already in doc 00.

### Notifications (§8) — two real bugs, confirmed in code, not previously tracked

7. **`runBusinessNotifications` calls `computeAnalyticsOverview(organizationIdStr, "all")` on every
   single invocation** (`notification-engine.ts:167`) — no caching, no throttling visible. Since this
   runs on every `business.data.changed` event and email-sync emits that event per record created,
   a single sync run can trigger this full aggregation many times in a row.
8. **Notification preferences are read from the *triggering user's* settings, not the
   organization's** — confirmed by the code's own comment (`notification-engine.ts:152-153`):
   *"preferences (enabled/thresholds) are still read from the triggering user's own settings — an
   accepted v1 simplification since notification preferences haven't moved to the organization
   yet."* This means whichever user happens to trigger a sync determines whether the *whole
   organization* gets notified — a real correctness gap, self-acknowledged in the code as a known
   shortcut, not yet fixed.

### Observability — not mentioned at all in doc 00

9. **No structured/leveled application logging.** Only `morgan` (HTTP access logging) is mounted in
   `app.ts` — confirmed, no `winston`/`pino`/equivalent anywhere.
10. **A single `/health` route exists** (`routes/health.routes.ts` → `getHealth`), but **no separate
    readiness check** (e.g. one that verifies DB connectivity before a load balancer routes traffic
    to a new instance) — confirmed only one endpoint, no liveness/readiness split.

---

## Confirmed unchanged from doc 00 (cross-reference only, no new detail)

- Watermark-not-advanced loop (node `AE` in §2's diagram) = doc 00 blocker #3. Same fix.
- OTP `Math.random()` flow (§6's diagram) = doc 00 blocker #2. Same fix.
- Documentation drift table (§11, D1–D11 in full) = doc 00's item #11, now with full file:line
  evidence for all 11 rows instead of doc 00's shorter summary. Same fix (rewrite
  `ARCHITECTURE.md`/`DECISIONS.md`/`README.md`/`PRODUCTION-HARDENING.md`), no new action.
- 129-adapter mislabeling (§3) — same underlying finding as doc 00's "desired vs actual" table row;
  full detail will come with document 05's own flow file.
- `SlackProcessedEvent`'s unique index "may not exist" (§9's background-jobs table) — confirmed the
  index **is declared** in the schema (`slack-processed-event.model.ts:29`), but per doc 00 blocker
  #1, declared indexes don't actually build in production. Same root cause, same fix (the index
  migration) — not a separate item.

## Correction to this document, based on doc 00's own inspection

Doc 01's system diagram lists Stripe under "Not present anywhere." **This is now only half true** —
per `flow/00-executive-summary.md`, an uncommitted credit-top-up Stripe flow already exists in the
working tree (on hold, per the user's instruction not to touch it yet). The plan-tier payment gate
Stripe would need is still genuinely absent, so the diagram's overall conclusion ("no revenue path
enforced") still holds — just not for the literal reason "zero Stripe code exists" anymore.

## Informational only — no action item, just risk awareness for later prioritization

- **Background jobs table (§9):** all six scheduled jobs run inside the API process with no queue,
  worker, or distributed lock — this is the same finding that justifies the Redis/BullMQ work
  already recorded at `~50 customers` trigger in the earlier architecture notes; not urgent now.
- **External service dependencies (§10):** Resend and Pipedream are both confirmed single points of
  failure with no fallback (a Resend outage = nobody can log in; a Pipedream outage = all ingestion
  stops). No code action right now — this becomes relevant when/if document 05's "move Gmail/Outlook
  to direct OAuth" recommendation is actioned, since that removes the Pipedream half of this risk.

---

## Updated combined suggested order (merges with doc 00's list, no duplicates)

Unchanged from `flow/00-executive-summary.md`'s order for items 1–9. Newly added from this document,
slotted in by dependency/risk:

10. Fix notification preferences to read from the organization, not the triggering user — small,
    independent, no dependency.
11. Add caching/throttling to `runBusinessNotifications`'s analytics call — small, independent.
12. Add `MAX_ITERATIONS` + fix the fire-and-forget credit deduction + escape (don't raw-stringify)
    tool results in the agent loop — groups naturally with the "agent router" work already slotted
    at position 8 in doc 00's order, since both touch `managed-agent.service.ts`.
13. Re-key `AgentSession` to `(user, organization)` — same grouping as #12.
14. Structured logging + a real readiness check — low priority, do whenever convenient, no
    dependency on anything else.

**Not yet approved for implementation — still awaiting the user's go-ahead on where to start.**
