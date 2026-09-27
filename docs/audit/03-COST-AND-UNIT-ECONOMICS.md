# Cost Model & Unit Economics

**Pricing verified 15 September 2026** from Anthropic's pricing documentation and Pipedream's docs. Where I estimate rather than verify, I mark it **[est]**. Formulas are given so you can re-run when rates change.

---

## 1. Verified input prices

| Item | Rate | Source |
|---|---|---|
| Claude Haiku 4.5 | **$1.00 / $5.00** per MTok (in/out) | Anthropic pricing docs |
| Claude Sonnet 5 | **$2.00 / $10.00** per MTok | Anthropic pricing docs |
| Claude Opus 5 | **$5.00 / $25.00** per MTok | Anthropic pricing docs |
| Prompt cache read | 0.1× base input | Anthropic pricing docs |
| Prompt cache write | 1.25× base input | Anthropic pricing docs |
| Batch API | −50% | Anthropic pricing docs |
| **Managed Agents session runtime** | **$0.08 / session-hour**, millisecond-metered, **accrues only while `running`** (idle is free) | Anthropic pricing docs |
| Managed Agents discounts | **Batch and Fast Mode do NOT apply** to managed sessions | Anthropic pricing docs |
| Pipedream Connect plan | **$99/mo**, 10,000 credits, 100 external users; **+$2 per additional external user** | Pipedream pricing |
| Pipedream credit | **1 credit per 30s of compute**; **"requests to the Connect proxy" consume credits** | Pipedream docs |

Two facts here have direct architectural consequences and are not reflected anywhere in the code:

1. **Session runtime is a billed dimension the credit ledger does not meter at all.** `tokensToCredits` (`config/credits.ts:70`) counts input + output tokens only. Idle time being free is genuinely helpful — the persistent per-user session is *not* a 24/7 cost bomb, which I want to be accurate about. But active tool-loop time is billed and invisible to you.
2. **Batch pricing does not apply inside Managed Agents.** The single largest cost lever (−50%) is unavailable in the current agent architecture. For a product whose most common queries are deterministic lookups, this is a real argument for routing those away from the managed session entirely.

---

## 2. Cost per unit of work

### Email extraction (Haiku 4.5, one call per candidate email)

From `ai-invoice-extractor.ts`: body capped at `MAX_BODY_CHARS = 6000`, `max_tokens: 512`, forced tool call.

```
input_tokens  ≈ preamble(~80) + from/subject(~30) + body(6000 chars ≈ 1500) + tool schema(~350)
              ≈ 1,950                                                          [est]
output_tokens ≈ 120 (structured tool call)                                      [est]

cost_per_email = 1950/1e6 × $1.00 + 120/1e6 × $5.00
               = $0.00195 + $0.00060
               = $0.0026
```

**Credits charged:** `ceil((1950+120)/1000) = 3` credits. At `CREDIT_USD_VALUE = $0.02`, that's $0.06 of notional value for $0.0026 of real cost — a **~23× markup**. The metering direction is right. The problem is what it's metering.

### Agent chat turn (Managed Agents, Sonnet-class **[est]** — model is set in the Console, not the repo)

A "turn" is not one API call. Per `managed-agent.service.ts:246-330`, each tool round-trip produces another `span.model_request_end`, and the full context is re-sent each time.

```
requests_per_turn ≈ 1 + tool_round_trips (typically 2–3)
input_per_request ≈ system+tools(~1,500) + history(~400 × turn_index) + tool_results(~500–2,000)

Turn 1  ≈  4,000 input,  300 output  (2 requests)
Turn 10 ≈ 15,000 input,  600 output  (2.5 requests)
Average over a 10-turn conversation ≈ 8,500 input, 500 output      [est]

cost_per_turn = 8500/1e6 × $2.00 + 500/1e6 × $10.00 + (15s/3600) × $0.08
              = $0.0170 + $0.0050 + $0.0003
              = $0.0223
```

**Credits charged:** `ceil(9000/1000) = 9` credits = $0.18 notional for $0.022 real. ~8× markup.

**The hidden multiplier the brief asked about:** one user question ≈ **2–3 model requests**, each re-sending the whole context. Cost per turn grows linearly with conversation length, so cumulative cost over a session grows **quadratically**. There is no summarization, no pruning, and no `MAX_ITERATIONS`.

### Recommendation generation

`runAgentPrompt` creates a throwaway session, sends analytics context, archives. Roughly one turn's cost, ~$0.02 **[est]** — but it is triggered by the event bus on every `business.data.changed`, including every email-sync run that creates a record.

---

## 3. The number that matters most

Here is the cost model applied to a normal SMB customer, **as the code currently behaves**:

> 2 connected inboxes. ~60 genuinely-new invoice emails per month. Pro plan ($15/mo, 4,000 credits).

`OVERLAP_DAYS = 1` (`sync-engine.ts:46`) means the search window always covers the last 24 hours, and there is no processed-message store. So every email is re-extracted on **all 24 hourly runs** before it ages out of the window.

```
extractions/month = 2 emails/day × 24 runs/day × 30 days × 2 inboxes = 2,880
credits consumed  = 2,880 × 3 = 8,640 credits
actual AI cost    = 2,880 × $0.0026 = $7.49/month

Correct behaviour (dedup by message id):
extractions/month = 60 × 2 = 120
credits consumed  = 360
actual AI cost    = $0.31/month
```

**A 24× cost multiplier — and 8,640 credits consumed against an allowance of 4,000.**

Now look at the allowance schedule (`config/credits.ts:52`):

```js
CREDIT_CYCLE_DAYS_BY_PLAN = { Free: 30, Pro: 365, Business: 365 }
```

**Pro and Business receive their credits once per YEAR.** So this customer:
- Exhausts their **entire annual AI allowance in roughly 13 days**
- Purely on redundant re-extraction of emails already processed
- Before sending a single chat message
- Then gets "Email sync paused — out of credits" and has a dead product for 11.5 months
- With no way to buy more, because there is no purchase flow

This is the most commercially dangerous finding in the audit. It is not a margin problem — margins are actually fine. It is a **product-destruction problem caused by two independent bugs interacting**.

### The large-mailbox case

A customer with >200 matching emails hits P0-03 (watermark never advances):

```
extractions/run   = 200
credits/run       = 600
Pro allowance     = 4,000 credits (per year)
runs before dead  = 6.7  →  under 7 hours
```

They will have seen at most 200 invoices, none older than 90 days, and their account is out of credits for a year. The uncapped-spend scenario is *contained* by the credit system — at the cost of the customer experience being destroyed in the first morning.

---

## 4. Monthly cost model at scale

Assumptions: average 2 inboxes/customer, 30 chat turns/customer/month, 60 new invoice emails/customer/month. "Fixed" scenario assumes P0-03 and the overlap bug are fixed; "As-is" applies the 24× multiplier.

| Service | Unit cost | 100 customers | 1,000 customers | 10,000 customers |
|---|---|---|---|---|
| **Anthropic — extraction (fixed)** | $0.0026/email | $31 | $312 | $3,120 |
| **Anthropic — extraction (as-is, 24×)** | — | **$749** | **$7,488** | **$74,880** |
| **Anthropic — agent chat** | $0.0223/turn | $67 | $669 | $6,690 |
| **Anthropic — recommendations** | ~$0.02/run | $29 **[est]** | $288 | $2,880 |
| **Pipedream Connect** | $99 base + $2/user >100 | $99 | $1,899 | $19,899 |
| **Pipedream credits** | see §5 | included | ~$400 **[est]** | ~$4,000 **[est]** |
| MongoDB Atlas | M10 → M30 → M50 | $60 | $200 | $1,100 **[est]** |
| Railway backend | 1 → N instances | $25 | $150 | $900 **[est]** |
| Vercel | Pro → Enterprise | $20 | $20 | $350 **[est]** |
| Resend | per email | $20 | $35 | $200 **[est]** |
| **TOTAL (fixed)** | | **~$351** | **~$3,973** | **~$39,139** |
| **TOTAL (as-is)** | | **~$1,069** | **~$11,149** | **~$110,899** |
| Revenue @ $15 ARPU | | $1,500 | $15,000 | $150,000 |
| **Gross margin (fixed)** | | **77%** | **74%** | **74%** |
| **Gross margin (as-is)** | | **29%** | **26%** | **26%** |

Fixing the two ingestion bugs is worth roughly **48 points of gross margin**. That is the highest-ROI engineering work in the repository by a wide margin.

---

## 5. Pipedream exposure

Every Gmail and Graph call routes through `connectProxyRequest` (`pipedream.ts:401`), and Pipedream's docs confirm **proxy requests consume credits** at 1 credit per 30 seconds of compute.

```
proxy_calls_per_run = 1 list call + N message fetches  (N ≤ 200)
credits_per_run     = (proxy_calls × avg_seconds) / 30

Light customer:  5 calls × 0.5s / 30  = 0.083 credits/run × 720 runs/mo = 60 credits/mo/inbox
Capped customer: 201 calls × 0.5s / 30 = 3.35 credits/run × 720 runs/mo = 2,412 credits/mo/inbox
```

With 10,000 credits on the Connect plan: **~83 light customers (2 inboxes each), or ~4 large-mailbox customers.** That is a hard cliff arriving much earlier than the seat count suggests.

Two further exposures:
- **`external_user_id` is the app's *user* id**, not the organization (`sync-engine.ts:166`). A 5-person org where each member connects an account counts as **5 external users**. The $2/user overage is therefore driven by seats, not accounts — and nothing in the app surfaces or caps this.
- **`format=full`** (`gmail-client.ts:76`) pulls the entire MIME payload including base64 attachment bytes through the proxy — increasing proxy compute time for data the parser then discards.

### Keep or replace Pipedream?

| Integration | Recommendation | Why |
|---|---|---|
| **Gmail** | **Move to direct Google OAuth** | One provider, well-documented, `history.list` gives real incremental sync and push notifications. Removes the highest-volume proxy traffic. ~1–2 weeks. Requires Google's restricted-scope security assessment (`gmail.readonly` is restricted) — budget for it, it's a real cost and a real timeline. |
| **Outlook / Graph** | **Move to direct Microsoft OAuth** | Same reasoning. Delta queries solve the ordering problem in P1-06 properly. ~1–2 weeks. |
| **129 billing-sync adapters** | **Keep on Pipedream** | Low call volume, enormous provider surface. This is exactly what Connect is for, and rebuilding 129 OAuth flows would be irrational. |

The argument for moving email off Pipedream is **not** that direct APIs are cleaner. It's that email sync is ~99% of your proxy volume, it's only two providers, and both offer incremental-sync primitives that Pipedream's generic proxy cannot expose.

---

## 6. Recommended credit model

Today, one credit is defined as "1,000 blended tokens" (`config/credits.ts:64`). That is an implementation detail no customer can reason about, and it doesn't map to anything they value.

**Define credits in units of customer-visible work:**

| Action | Credits | Rationale |
|---|---|---|
| Invoice discovered & extracted | 1 | Direct value; real cost ~$0.0026 |
| Agent question answered (with AI) | 5 | Real cost ~$0.022 |
| Deterministic query (totals, filters, lists) | **0** | Should never touch an LLM |
| Weekly insight report | 10 | Batched, cacheable |

Then enforce it properly:
- **Reserve before, reconcile after.** Atomic `$inc` of an estimated cost *before* the call; adjust to actual on completion. Replaces the current stale-cache check + fire-and-forget deduction.
- **Monthly cycles for every tier.** `CREDIT_CYCLE_DAYS_BY_PLAN` should be `{Free: 30, Pro: 30, Business: 30}`.
- **Meter session-hours** alongside tokens, or accept a known under-recovery and document it.
- **Per-org daily cap** as a backstop against any future runaway loop.

### Suggested plan structure

Assumes the ingestion bugs are fixed. COGS is per customer per month.

| Plan | Price | Inboxes | Credits/mo | Records | Seats | COGS **[est]** | Margin |
|---|---|---|---|---|---|---|---|
| Free | $0 | 1 | 100 | 100 | 1 | ~$1.20 | acquisition cost |
| Starter | $29 | 3 | 1,000 | 2,500 | 3 | ~$3.50 | 88% |
| Growth | $99 | 10 | 5,000 | 25,000 | 10 | ~$14 | 86% |
| Business | $299 | unlimited | 20,000 | unlimited | unlimited | ~$48 | 84% |

The current $15 Pro is underpriced for what this product costs to run and — more importantly — for what it's worth if it works. A business that discovers $800/month of forgotten subscriptions will not quibble over $99. Price against the savings, not against the compute.

**Usage-based vs. plan-based:** inbox count, seats, and retention should be plan-based (predictable, easy to reason about). AI credits should be plan-included with a **paid top-up** — that's the natural Stripe metered-billing shape and it protects you from exactly the runaway scenarios above.

---

## 7. Cost controls, in priority order

1. **Processed-message table** — kills the 24× multiplier. Biggest single win.
2. **Route deterministic queries away from Claude.** "How much did I spend last month?" should be an intent classifier + an aggregation, not a managed-agent turn. Probably 60–70% of queries **[est]**.
3. **Conversation summarization** at N turns — stops the quadratic growth.
4. **`MAX_ITERATIONS` on the tool loop** + a stream timeout.
5. **Prompt caching** on the extraction call — the tool schema and preamble (~430 tokens) are identical on every call and cacheable at 0.1×.
6. **Batch API for extraction.** Email sync is asynchronous by nature. −50%. (Note: available for the Messages API extraction path, *not* for Managed Agents.)
7. **Pre-LLM deterministic filter.** Sender allow/deny lists, known-vendor templates, and cheap heuristics should resolve the easy cases before any token is spent. Target: only 20–30% of candidates reach the LLM.
8. **Per-org daily spend cap** with an alert.
9. **`format=metadata` for triage**, full fetch only on candidates — cuts Pipedream proxy compute.

---

## 8. Is Managed Agents the right choice?

**Honest answer: partially.** It is the right tool for open-ended reasoning ("which subscriptions should we cancel and why"). It is the wrong tool for the ~70% of queries that are lookups and sums, because:

- Batch and Fast Mode discounts don't apply
- Session runtime is billed and currently unmetered by you
- Full context is re-sent on every tool round-trip, with no pruning
- The system prompt and tool schemas live outside version control, so you can't review, diff, or test them

**Recommended split:**
- **Intent router** (cheap Haiku classification, or pure pattern matching) → deterministic analytics for lookups, totals, filters, and status queries. Zero credits, sub-100ms, always correct.
- **Managed Agents** reserved for genuine multi-step reasoning, with summarization and an iteration cap.
- **Direct Messages API + Batch** for extraction (already the case — keep it, add caching and batching).

This is cheaper *and* more accurate, because financial arithmetic done by code is arithmetic you can test.
