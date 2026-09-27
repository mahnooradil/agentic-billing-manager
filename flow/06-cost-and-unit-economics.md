# Flow for Document 06 — Cost and Unit Economics

**Read:** in full, line by line. **Inspected against live code:** the *bugs* this document's math is
built on were already verified in earlier documents (`OVERLAP_DAYS=1`, `MAX_MESSAGES_PER_RUN=200`,
`CREDIT_CYCLE_DAYS_BY_PLAN` annual — all confirmed in `flow/00-executive-summary.md`). This document
itself contains almost no new code claims — it's mostly **derived financial math** on top of
already-confirmed facts, plus three specific technical claims verified fresh below. Treat the dollar
figures as the audit's own estimates (many marked **[est]** in the source), not independently
re-derived here — the value of this file is having the numbers in one place for pricing/roadmap
decisions, not re-proving arithmetic.

---

## Cross-reference — bugs this document's math depends on

| Bug this section quantifies | Already tracked in |
|---|---|
| §3 the 24× multiplier | `flow/00-executive-summary.md` #3, `flow/05-email-invoice-intelligence.md` |
| §3 annual not monthly credit cycle | `flow/00-executive-summary.md` #4 |
| §6 in-process schedulers / no worker | `flow/01-current-architecture.md` (informational) |
| §8 "is Managed Agents right" recommendation | Same conclusion already reached in `flow/04-ai-agent-and-memory-audit.md` §8 — this document is the cost justification for that same decision, not a new one |

---

## Three new technical claims, verified fresh

1. **`external_user_id` confirmed to be the connecting *user's* id, not the organization's** —
   `sync-engine.ts:154`: `const externalUserId = connection.user.toString()`. Confirms the
   seat-driven Pipedream billing exposure exactly as described: a 5-person org where each member
   connects their own inbox counts as 5 separate external users against Pipedream's 100-included
   limit, and nothing in the app surfaces or caps this today.
2. **`maxPoolSize: 10` confirmed** in `config/database.ts:37` — the Mongo connection pool cap the
   "~50 concurrent agent chats" cliff in §6 is based on.
3. **`format=full` confirmed** in `gmail-client.ts:81` — every message fetch pulls the complete MIME
   payload (including base64 attachment bytes) through the Pipedream proxy, which the parser then
   discards since attachments aren't opened (already tracked as a recall gap in document 02's flow
   file) — this is the same fact's *cost* side: paying proxy compute to transfer data that's thrown
   away.

---

## Reference data worth keeping verbatim — for pricing/roadmap decisions, not code changes

### Verified pricing (as of the audit date, re-verify if rates change)

Haiku 4.5 $1/$5 per MTok in/out · Sonnet 5 $2/$10 · Opus 5 $5/$25 · prompt cache read 0.1× base,
write 1.25× base · Batch API −50% · **Managed Agents session runtime: $0.08/session-hour, billed
only while `running`, idle is free** · **Batch/Fast Mode discounts do not apply inside Managed
Agents at all** · Pipedream Connect $99/mo (10,000 credits, 100 external users, +$2/extra user; 1
credit per 30s of proxy compute).

### The number that matters most, with the actual formula (not just the conclusion)

```
As-is (OVERLAP_DAYS=1, no dedup):
  extractions/month = 2/day × 24 runs/day × 30 days × 2 inboxes = 2,880
  credits consumed  = 2,880 × 3 = 8,640          (Pro allowance: 4,000/year)
  real AI cost      = 2,880 × $0.0026 = $7.49/month

Correct (dedup by message id):
  extractions/month = 60 × 2 = 120
  credits consumed  = 360
  real AI cost      = $0.31/month
```
A normal Pro customer exhausts their **entire annual** allowance in **~13 days**, before sending a
single chat message. Fixing this and the credit-cycle bug together is estimated to move gross margin
from **26% → 74%** at 1,000 customers — the single highest-ROI item in the whole audit.

### Pipedream proxy exposure — the formula behind "move Gmail/Outlook off Pipedream"

```
credits_per_run = (proxy_calls × avg_seconds) / 30
Light customer:  5 calls × 0.5s / 30   = 0.083 cr/run × 720 runs/mo =    60 cr/mo/inbox
Capped customer: 201 calls × 0.5s / 30 = 3.35  cr/run × 720 runs/mo = 2,412 cr/mo/inbox
```
With a 10,000-credit Connect plan: **~83 light customers, or ~4 large-mailbox customers**, before a
credit-overage cliff — arriving earlier than seat count alone suggests. This is the quantified case
for the "direct Google/Microsoft OAuth for Gmail+Outlook, keep the 129 adapters on Pipedream"
recommendation already noted in document 05's flow file.

### Infrastructure evolution and cost cliffs — the table behind the earlier Redis discussion

This is the same table already given verbally when the user asked about Redis directly — recorded
here now since this document (06 §6) is its actual source.

| Stage | Trigger | Change | Added cost |
|---|---|---|---|
| Now | — | Single API instance, Atlas M10, Vercel Pro | ~$105/mo |
| 1 | Immediately | Error tracking + structured logging | +$26/mo |
| 2 | **~50 customers** | **Worker process + Redis/BullMQ** | **+$35/mo** |
| 3 | ~200 customers | Atlas M30; 2 API instances | +$180/mo |
| 4 | ~1,000 customers | Atlas M50; worker autoscaling; analytics pre-aggregation | +$900/mo |

**Known cliffs, each with a concrete trigger:** sequential sync loop (~50 connections, one hourly
pass starts exceeding an hour) · Pipedream credits (~83 customers or 4 large mailboxes) · Pipedream
external users (100 connecting users, seat-driven) · Mongo pool exhaustion (~50 concurrent agent
chats, confirmed `maxPoolSize: 10` above) · in-process schedulers doubling on a 2nd instance or any
rolling deploy · unbounded `GET /billing` (~10k records/org, already tracked in document 02's flow
file) · missing compound indexes (~1M records) · `autoMarkOverdue`'s global scan (~1M records).
**Kubernetes/microservices are explicitly not recommended at any stage.**

### Cost controls, in the document's own priority order

1. Processed-message table — kills the 24× multiplier, biggest single win (already tracked).
2. Route deterministic queries away from Claude — ~60–70% of queries (already agreed as the
   router design in earlier conversation and document 04's flow file).
3. Conversation summarization at N turns.
4. `MAX_ITERATIONS` + stream timeout (already tracked, document 01).
5. Prompt caching on extraction (already tracked, document 05).
6. Batch API for extraction (already tracked, document 05).
7. Deterministic pre-filter, target ≤25% of candidates reaching the LLM (already tracked, document
   05's target pipeline).
8. Per-org daily spend cap with an alert — **net-new, not yet tracked anywhere.**
9. `format=metadata` for triage, full fetch only on candidates — directly addresses the `format=full`
   waste confirmed above.
10. Rate-limit `/recommendations/refresh` + a minimum interval on the event-triggered refresh — ties
    to the recommendation-engine single-flight-per-user gap already known conceptually.

Applying items 1, 5, 6, and 7 together is estimated to take extraction from $0.0026/email × 24
redundant calls down to **~$0.0008 per unique email — a ~78× reduction.**

---

## Updated combined suggested order (adds to the running list)

39. Per-org daily AI spend cap with an alert — small, independent, good defense-in-depth regardless
    of what else gets fixed first.
40. Switch triage fetches to `format=metadata` before full fetch on genuine candidates — small,
    isolated, direct proxy-cost reduction, pairs naturally with the ingestion-pipeline rework already
    planned in document 05's order.
41. Surface/cap Pipedream's per-seat external-user exposure — low urgency until approaching the
    ~100-user cliff, but cheap to add a warning once the org-connections UI is touched anyway.

**Not yet approved for implementation — still awaiting the user's go-ahead on where to start.**
