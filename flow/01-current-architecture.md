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

1. **No `MAX_ITERATIONS` anywhere in `managed-agent.service.ts`.** Confirmed by direct search — no
   match at all. The tool-call loop can run unbounded.
2. **`void consumeCredits(...)` is fire-and-forget, and it happens in *two* separate places**
   (`managed-agent.service.ts:208` and `:346`) — confirmed. A crash between either point and the
   ledger write means that usage is free.
3. **Tool results are raw-`JSON.stringify`'d into the agent's context**
   (`managed-agent.service.ts:261`, confirmed) — vendor names/invoice numbers pulled from email
   reach the model as literal, unescaped text. Second-order prompt-injection surface.
4. **`AgentSession` has a unique index on `user` only** (`agent-session.model.ts:34`, comment reads
   "one active agent session per user") — confirmed keyed by user, not `(user, organization)`.
5. **`getOrganizationIdForUser(userId)` is a genuinely separate, independent tenancy-resolution
   path** from `req.organization` — and it is **not only used by the agent**. Confirmed it is also
   called directly inside `notification-engine.ts:160`. This is a wider pattern than document 01's
   diagram implied (it only drew this for the agent) — any module using this helper instead of the
   already-resolved `req.organization` has the same "two sources of truth for one authorization
   decision" seam. Worth checking for other call sites when this is actually fixed, not just the
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
