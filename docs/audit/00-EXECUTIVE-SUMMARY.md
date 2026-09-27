# Executive Founder Summary — `agentic-billing-manager`

**Audit date:** 15 September 2026
**Commit audited:** `e3ad6ad` (shallow clone, 36 commits visible)
**Scope:** Full repository read (~21k LOC backend TS, ~107 frontend TSX), static verification run, no code modified.
**Method:** Code treated as truth. Docs treated as claims. Every claim traced to a file and line.

---

## The one-paragraph verdict

This is a competently built, genuinely thoughtful CRUD SaaS with an AI chat feature bolted on — not yet an AI financial agent. The engineering craft is well above average for a solo project: the tenancy filtering in the HTTP layer is actually correct, the org-switch/agent-session interaction was anticipated and handled, Slack signature verification is textbook, and the code comments show real incident-driven learning. But the product it is trying to become requires three things it does not have: a domain model that can represent an invoice's life, a provenance trail that lets a user verify anything, and an ingestion pipeline that finds invoices reliably and affordably. All three are absent, not partial. Layered on top are a small number of unambiguous production-blocking defects — predictable auth codes, indexes that are never built in production, and a sync loop that can permanently re-bill the same 200 emails every hour. None of this is unrecoverable. All of it is disqualifying today.

---

## Would I…?

| Question | Answer |
|---|---|
| Launch this today? | **NO** |
| Accept paying customers today? | **NO** — there is no payment code at all (see below) |
| Trust it with my own company's invoices today? | **NO** |
| Can this architecture become the intended product? | **YES, WITH CHANGES** — the backbone is sound; the invoice domain must be rebuilt |

---

## What the product actually does today

**Works:**
- Passwordless email-OTP auth, sessions, multi-org membership, invitations, role gating on org/plan routes
- Manual invoice CRUD, CSV import/export
- Gmail + Outlook inbox scanning (via Pipedream-vaulted OAuth) → Claude Haiku extracts fields → upsert into a `Billing` collection
- 129 read-only "billing-sync" adapters that pull usage/invoices from vendor APIs
- A Claude Managed Agents chat ("Billing Advisor") with 6 tools, reachable from the web UI and Slack DM
- Rule-based notifications (due-date, overdue, sync-paused) with dedup by signature
- Multi-currency-aware analytics (grouped by currency — genuinely correct)
- A credit ledger that meters real Anthropic token usage

**Does not work / does not exist:**
- **No payments.** Zero Stripe. `PUT /api/plan` lets any owner/admin set their own tier to Business for free (`plan.controller.ts:66`). Monetization is 0% built.
- **No tests. No CI.** Zero test files, zero `.github/`, no test framework in either `package.json`.
- **No PDF or attachment parsing.** `parser.ts` reads `text/plain` → `text/html` → snippet. Any invoice that arrives as a PDF attachment is invisible. For B2B, that is a large share of all invoices.
- **No provenance.** A `Billing` record stores no source message ID, no thread ID, no sender address, no confidence. "Where did this invoice come from?" and "What email proves this was paid?" — both core vision questions — are unanswerable by construction.
- **No learning.** The only persistent per-org intelligence is `trackedSenders`: a list the user types in by hand. No vendor profiles, no sender reputation, no correction feedback loop, no rules.

---

## Desired product vs. actual product

| Vision requirement | Reality |
|---|---|
| "Should NOT simply search for the word 'invoice'" | It searches for the words invoice, receipt, statement, "amount due"… (`gmail-provider.ts:8-18`) |
| ~40 financial event types (reminder, refund, credit note, trial ending…) | 3 statuses: `Pending \| Paid \| Overdue` (`billing.model.ts:20`) |
| "Concept of confidence, evidence/provenance" | No confidence field. No evidence field. No source message id. |
| "One financial obligation" across invoice → reminder → receipt | No lifecycle. Status is overwritten by whichever email sorts last in the run. |
| "Show invoices from AWS" | **Broken.** Email-derived records store `customerName = your own org name` (`sync-engine.ts:505`); the agent's search tool has no vendor parameter (`billing-search.tool.ts`). |
| "The agent learns the user" | It does not. See classification below. |
| Dedup across Gmail + Outlook | Deliberately namespaced *per provider* — the same invoice in both inboxes creates two records. |
| Scan "email history" | First sync looks back **90 days** (`gmail-provider.ts:20`), with no way to backfill further. |

---

## Learning architecture classification

The prompt asked me to classify this precisely. It is a **stateless, data-grounded assistant with conversational memory** — and a *transient* one at that.

- **Not feedback-learning.** A user correction writes `manuallyEditedAt` on one row. Nothing reads that to change future classification. Correcting "this is not an invoice" 50 times changes nothing about attempt 51.
- **Not preference-aware.** `trackedSenders` is manual configuration, not learned.
- **Not organization-aware across sessions.** The Managed Agents session is the only memory, keyed per user, and it is **destroyed on org switch** (`auth.controller.ts:279`) and on "New Chat". Correct for isolation — but it means there is no durable org memory at all.
- Every extraction call is fully stateless: one email in, fields out, no history, no vendor prior (`ai-invoice-extractor.ts`).

**Do not call this "the agent learns your business."** It is not a defensible claim and a technical buyer will catch it in five minutes.

---

## Scores (0–10, with reasons)

| Dimension | Score | Why |
|---|---|---|
| Product usefulness | **3** | Real value exists (auto-discovered invoices in one table) but is undermined by recall gaps and untrustworthy status |
| Invoice detection | **3** | Keyword search + no attachments = structurally capped recall; 90-day window |
| Invoice status accuracy | **2** | Single-email LLM guess, no confidence, no evidence, overwritten by sort order |
| Email integrations | **5** | Gmail solid; Outlook relies on an unverified ordering assumption that can silently lose mail |
| Agent intelligence | **5** | Tool-calling is real and org-scoped; the vendor-search gap cripples the most common query |
| Agent personalization / learning | **1** | Effectively none |
| Analytics | **6** | Multi-currency grouping is correct — better than most. Primary-currency filtering silently hides data |
| Automation | **4** | Notifications are rule-based (right call); no user-definable rules |
| Security | **3** | HTTP-layer tenancy is good; auth primitives and prompt-injection handling are not |
| Multi-tenancy | **7** | Genuinely well done at the controller layer. Dual org-resolution path is the weak seam |
| Reliability | **3** | `catch {}` everywhere, no sync error surface, single-instance schedulers |
| Performance | **3** | Unbounded list endpoints, sequential sync loop, missing compound indexes |
| Scalability | **2** | The hourly sync pass is O(connections × 200 × LLM latency), sequential |
| Cost efficiency | **2** | Re-extracts the same emails hourly; agent has no turn cap, no summarization, no caching |
| UI/UX | **6** | Clean shadcn app, sensible IA; no trust/provenance surfaces |
| Onboarding | **3** | No guided first sync, no privacy explanation, no sync progress |
| Pricing readiness | **2** | Pro grants its AI allowance **once per year**, not monthly |
| Stripe / payment readiness | **0** | Does not exist |
| Production readiness | **2** | Blocked on index building alone |

---

## The five biggest reasons not to launch

1. **Indexes are never created in production.** `autoIndex: !isProduction` (`database.ts:40`) and there is no `syncIndexes()` anywhere in the repo. Every uniqueness guarantee the code relies on — user email, OTP-per-email, invoice dedup, Slack event dedup — silently does not exist in prod. This works perfectly in dev, which is why it hasn't been caught.
2. **Auth codes are guessable.** OTPs come from `Math.random()` (`auth.controller.ts:67`), the 5-attempt counter is a non-atomic read-modify-write (`:104`), and there is no rate limit on any auth route. Three weaknesses that compound into account takeover.
3. **The sync loop can bill forever and never finish.** If a mailbox has >200 matching emails, the watermark refuses to advance (`sync-engine.ts:329`), so the next run re-fetches and re-LLMs the *same* 200 emails. Every hour. Until credits hit zero. The customer never sees their older invoices and pays for the privilege.
4. **No revenue path exists.** Not "Stripe needs hardening" — there is no Stripe. Plans are free to self-assign.
5. **Nothing is verifiable.** No source email, no confidence, no audit trail. A CFO cannot check your work, and an invoice they can't check is an invoice they won't act on.

---

## The five highest-ROI improvements

1. **Ship an index migration + `syncIndexes()` on boot.** Hours of work. Unblocks everything else and retroactively makes several existing safety mechanisms real.
2. **Store provenance on every record** (`sourceMessageId`, `sourceThreadId`, `senderEmail`, `senderDomain`, `extractionConfidence`, `evidence[]`). This is the single change that converts the product from "AI guessed" to "AI found, here's the proof" — and it unlocks trust UX, dedup, the state machine, and the learning loop simultaneously.
3. **Add a processed-message-ID table.** Kills the re-extraction loop, cuts steady-state AI spend by roughly an order of magnitude, and lets backfill actually complete.
4. **Fix the vendor model.** Rename the inverted `customerName`/`vendorName` pair, add `vendorId` + `vendorDomain`, and give the agent a vendor search parameter. "Show invoices from AWS" is *the* demo query.
5. **Route deterministic questions away from the LLM.** Totals, filters, and date math should never reach Claude. This is both a cost fix and an accuracy fix.

---

## The five biggest technical risks

1. Production index absence invalidating dedup and uniqueness guarantees
2. Indirect prompt injection — email content flows into the Haiku extractor with no system prompt or delimiter, and extracted vendor names flow into the agent's context unsanitized
3. Outlook's `$search` ordering assumption (`outlook-provider.ts:46`) — Graph returns relevance-ranked results; the early-stop advances the watermark on a possibly wrong premise, silently skipping mail
4. Single-instance in-process schedulers (`setInterval`) — any horizontal scale or rolling deploy doubles every sync and every credit deduction
5. Zero tests on a financial data path, with no CI to catch regressions (the frontend lockfile is already out of sync — `npm ci` fails today)

## The five biggest business/product risks

1. No payment infrastructure — the revenue clock hasn't started
2. Pro plan grants 4,000 credits **per year**; a normal user exhausts it inside month one and then has a dead product for 11 months
3. Credit pricing ignores Managed Agents' `$0.08/session-hour` dimension and misses the fact that batch and Fast Mode discounts do not apply to managed sessions
4. Recall gap (no PDFs, 90-day window) means the dataset is visibly incomplete on day one — fatal for a "trustworthy billing dataset" pitch
5. Differentiation is thin: without provenance and learning, this is a worse Ramp/Brex expense view with an extra chat box

---

## Static verification — exact results

| Check | Result |
|---|---|
| `backend: tsc --noEmit` | **PASS** (0 errors) |
| `backend: npm run build` | **PASS** |
| `backend: eslint src --ext .ts` | **PASS** (0 warnings) |
| `backend: npm audit --omit=dev` | **2 moderate** — `morgan <1.12.0` (log forging), `qs` (DoS / array-limit bypass) |
| `frontend: npm ci` | **FAIL** — lockfile out of sync (`@emnapi/runtime@1.11.3`, `@emnapi/core@1.11.3` missing). Vercel uses `npm ci`. This is a live deploy risk, and a regression of commit `7f67c1c`. |
| `frontend: tsc --noEmit` (after `npm install`) | **PASS** (0 errors) |
| `frontend: npm run build` | **Not verified** — fails only on Google Fonts fetch, blocked by this sandbox's network allowlist. Not a repo defect. |
| Test suite | **None exists** |
| CI | **None exists** |

---

## What I would do in the next 30 days

Stop building features. In order:

1. Index migration + `syncIndexes()` on boot
2. `crypto.randomInt` for OTPs; atomic `$inc` on attempts; rate limits on all three auth routes; `app.set('trust proxy', 1)`
3. Processed-message table + let the watermark advance on cap
4. Provenance fields on `Billing` + backfill what's recoverable
5. A first test suite around exactly those four things, wired into GitHub Actions

That is roughly four weeks of focused work and it moves the product from "cannot launch" to "can run a private beta." Everything else — Stripe, the state machine, the learning loop, the target architecture — is sequenced in `04-ROADMAP-AND-LAUNCH-READINESS.md`.

---

## A note on the documentation

`docs/ARCHITECTURE.md` is marked **"🔒 FROZEN / LOCKED"** and describes a LangGraph agent running on Qwen 3 Instruct. `docs/DECISIONS.md` D-001 states that flow is locked and "any change requires a new decision entry here." No such entry was ever written. The actual implementation is Claude Managed Agents plus Claude Haiku 4.5.

This is the single most dangerous artifact in the repository, because the next AI coding agent that reads it will believe it. Delete or rewrite it before anything else touches this codebase.

---

*Detailed findings with file/line evidence: `01-CRITICAL-FINDINGS.md`. Architecture reconstruction and drift table: `02-ARCHITECTURE-AND-DRIFT.md`. Cost model and unit economics: `03-COST-AND-UNIT-ECONOMICS.md`. Sequenced remediation: `04-ROADMAP-AND-LAUNCH-READINESS.md`.*
