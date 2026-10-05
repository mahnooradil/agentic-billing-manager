# Flow for Document 10 — Remediation Roadmap

**Read:** in full, line by line. **No new code verification needed for this document** — it's pure
sequencing/planning built entirely on facts already confirmed in documents 00–09's flow files. This
document's real job is different: it's the **canonical structure** that every "Updated combined
suggested order" numbered item across `flow/00-09` already referenced by name (WP-1, WP-4, WP-7,
etc.) without ever having its own definition written down. This file is that definition, plus a
reconciliation of everything scattered across the other nine files into one place.

---

## The canonical work packages (WP-0…WP-12) — the structure already referenced everywhere else

| WP | Title | Weeks | Depends on | What it actually contains (per document 00–09's own findings) |
|---|---|---|---|---|
| 0 | Documentation correction | 0.2 | none | ✅ **Done (2026-10-01).** `ARCHITECTURE.md` rewritten against reality (not deleted — points to `CLAUDE.md` as the source of truth instead), `DECISIONS.md` gained D-004 superseding D-001, `README.md`'s "production-ready" claim removed. See `flow/00` item #11. |
| 1 | Production integrity & auth hardening | 1.5 | none | ✅ **Done (2026-09-26).** Index migration (task #1), OTP hardening + rate limiting + `trust proxy` + Session/Otp TTLs (task #2), CI pipeline (task #4) — all five listed items covered. See tasks #1/#2/#4 below. |
| 2 | Ingestion cost & completeness | 1.5 | WP-1 | ✅ **Done.** `ProcessedMessage` store, watermark-advance fix, reconnect fix, `lastSyncError` surfaced (`flow/00` #3, `flow/02` item 6/16, `flow/05` items 34/37). The paired economics bug CLAUDE.md §10.4 said to "fix both together" — `CREDIT_CYCLE_DAYS_BY_PLAN` annual→monthly for Pro/Business, CR-012 — is also now done, see `flow/00` item #12. |
| 3 | Analytics correctness | 0.8 | WP-1, ∥ WP-2 | ✅ **Done, live-verified (2026-10-03).** Mixed-currency sum removed (backend stats + dashboard headline), `dueDate`/compound indexes added and applied live, `/billing` safety-capped + paginated — confirmed against the real running server with real HTTP calls (not just vitest), real mixed-currency data, cleaned up by exact tracked id afterward. See `flow/00` item #13. **Not done, by design:** the larger server-side search/filter/sort/pagination rework of `billing-view.tsx`'s table, and the full dashboard-hierarchy redesign (`flow/08` item 47) — both explicitly separate, larger pieces of work. |
| 4 | **Domain model rebuild** | 3.0 | WP-1 | ✅ **Done (2026-10-04).** `Vendor` + `BillingEvent` + `deriveStatus()` done 2026-09-26 (tasks #7/#8 below). `UsageAccrual` model + the 129 billing-sync adapters' `Billing`-vs-`UsageAccrual` split done 2026-09-30/2026-10-01 (`flow/00` item #9d). `UsageAccrual` UI done 2026-10-04 (`flow/00` item #27, task #11 below). The `derivedStatus` → `status` cut-over — narrow, bug-fix-only scope, per the user's own explicit choice over the full vocabulary expansion — done 2026-10-04 (`flow/00` item #28, task #12 below), and live-verified end-to-end through a real Gmail inbox (`flow/00` item #29). |
| 5 | Trust surfaces | 1.5 | WP-4 | ✅ **Done (2026-10-04).** First pass (origin badges, low-confidence flag, "view source email" dialog, status explanation, manual-edit attribution) done 2026-10-01, `flow/00` item #17. Duplicate flags + non-destructive merge/unmerge, and the "confirm detected vendors" onboarding step, done 2026-10-04 — `flow/00` item #30, task #13 below. **Deliberately not built** (per `flow/08`'s own framing as separate, larger pieces of work, never actually part of WP-5's scope): the full guided onboarding wizard around the vendor-confirmation panel, and the §7 dashboard-hierarchy redesign. |
| 6 | Recall: attachments & providers | 2.5 | WP-2, WP-4 | ⚠️ **PDF parsing half done (2026-10-04)**, see `flow/00` item #32 — Gmail/Outlook attachment fetch + `unpdf` text extraction, appended to the AI extractor's input, live-verified against a real Gmail inbox with an invoice whose every field existed ONLY in the attached PDF. **Direct Gmail/Outlook OAuth (`flow/05` item 38) remains not done** — genuinely blocked on Google/Microsoft's third-party security review process (4-8 weeks external calendar time, outside this session's control), not a scope or priority choice. |
| 7 | Agent architecture | 2.0 | WP-4, ∥ WP-6 | ✅ **Done (2026-10-04).** `MAX_ITERATIONS=8` (two-tier, soft+hard) and `AgentSession` re-keyed to `(user, organization)` done 2026-10-01 (`flow/00` item #9c); config-in-repo re-sync done the same day (item #15). The two remaining items — the intent router and the `getOrganizationIdForUser` consolidation — both done 2026-10-04: `flow/00` item #31. Org-id consolidation closes the theoretical concurrent-org-switch race (`flow/01` item #5) by threading the SAME `organizationId` through every agent tool instead of each one re-deriving it independently. The intent router deterministically answers `aggregate`/`lookup`/`explain` questions at 0 credits (wired into both web and Slack chat, tried before the credit gate) — `action`/`rule` deliberately still agent-routed, not deterministic, a disclosed scope limit not an oversight. |
| 8 | Injection defense & sender verification | 1.0 | WP-6, WP-7 | ✅ **Done (2026-09-26), ahead of its own listed dependencies.** System-prompt framing, SPF/DKIM/DMARC capture, output sanitization — all three built and live-verified against the real Anthropic API on 2026-10-03 (two real adversarial-email attacks, both correctly handled). See task #9 below. The WP-6/WP-7 dependency listed here didn't turn out to be a hard one — this work didn't actually need PDF parsing/direct OAuth or the agent intent router to exist first. |
| 9 | **Payments** | 2.5 | WP-1, ∥ WP-4/5 | ✅ **Done (2026-09-29) — the "ON HOLD" below is now stale.** The user's own explicit go-ahead ("chalo phir Task 10 shuru karo") unblocked this; full Stripe subscription/plan-tier architecture built — see task #10 below and the "Reconciliation" section further down this file. No live Stripe account exists in this environment, so this was verified against realistic fixtures, not a real webhook delivery — "refund" (one of 9 scenarios) also not implemented, both disclosed as real gaps in task #10's own entry. |
| 10 | Scale | 2.0 | WP-2 | ⏸️ **Deliberately deferred (2026-10-05), user's own explicit choice when asked.** Worker process, Redis/BullMQ, distributed locks (`flow/06`'s infra-evolution table — the ~50-customer trigger). Real Atlas data checked at the time: 5 organizations, 4 users, 1 connected platform — nowhere near the trigger condition this work is scoped against. Building it now would add real cost/complexity (+$35/mo, a new Redis dependency) for a problem that doesn't exist yet — revisit once real usage actually approaches ~50 customers. |
| 11 | Learning loop | 2.0 | WP-4, 5, 8 | ✅ **Done (2026-10-05).** See `flow/00` item #34. `SenderProfile` + `ClassificationFeedback` built, nightly trust-evaluation job wired into `sync-engine.ts` (suppressed senders skipped before any AI call, trusted senders get a confidence floor). `UserRule`'s "ignore domain X" folded into `SenderProfile.manuallySet` rather than a separate model — disclosed scope simplification. `UserRule`'s "remind N days before Z" and flow/04's "Global" curated-vendor-registry tier both deliberately not built (a different concept; an ongoing content-curation task, not a coding feature, respectively). |
| 12 | Privacy & retention | 1.0 | WP-4 | ✅ **Done (2026-10-04).** All five named items landed: transactional deletion (item #24), audit log on financial mutations (item #25), and full data export + OAuth-consent privacy copy + a retention policy statement (item #26) — all live-tested against real Atlas. **Deliberately not built:** automatic time-based data deletion — the user explicitly chose a written retention statement over an automated deletion mechanism when asked, since guessing wrong there risks real financial data. |

**Total: 21.5 engineer-weeks → ~26 with a 20% review/unknowns buffer.** ~4 months solo, ~2.5 months
with two engineers.

**Reasoning for the two deviations from a naive P0→P1→...→scaling order, both already reflected in how
earlier flow files sequenced things:** Stripe runs in parallel rather than serialized behind the
domain rebuild (touches nothing WP-4 touches); sync reliability (WP-2) comes before full invoice
correctness (WP-4) because the re-extraction loop is destroying credit balances *right now* and its
fix is small, while the domain rebuild is a 3-week migration — stop the bleeding first.

---

## The next 10 engineering tasks, in exact required order — the real starting point

This is the single most actionable list in the entire 12-document set. Reconciled against everything
already found:

1. ✅ **DONE (2026-09-26) — Build indexes in production.** Full detail in
   `flow/00-executive-summary.md` item #1. Tests: INF-001…004 verified manually (test framework
   doesn't exist yet — task #4 — so this was verified via a real boot + an isolated scratch-model
   failure-path check, not an automated suite).
2. ✅ **DONE (2026-09-26) — Harden the OTP flow, including Session/Otp TTLs and the S-13 uniform
   login response** (folded in the same day rather than deferred — see `flow/00-executive-summary.md`
   item #2 for the full update). Tests AUTH-008/011/014/015/016/037 verified via live scratch tests
   against the real server and database (no automated suite yet — task #4); INF-027 (`trust proxy`)
   confirmed by code + the rate limiter behaving correctly by IP in the live test.
3. ✅ **DONE (2026-09-26) — Processed-message store + watermark fix**, plus the S-11 reconnect bug
   in the same files. Full detail, including a documented reasoned deviation from this task's own
   "advance on cap" phrasing, in `flow/00-executive-summary.md` item #3. Tests GM-004/005/006/010b
   verified by direct code trace + live DB-level tests of the exact dedup and reconnect mechanics (no
   automated suite yet — task #4; no real-provider end-to-end run — no test inbox available, flagged
   honestly rather than assumed).
4. ✅ **DONE (2026-09-26) — CI pipeline + first tests.** Full detail in
   `flow/00-executive-summary.md` item #6: Vitest + mongodb-memory-server + supertest, 14 tests
   across 4 files automating Tasks 1–3's manual verifications, a real dist/-leak bug caught and
   fixed (`tsconfig.build.json`), and `.github/workflows/ci.yml` (backend + frontend jobs). The
   type-error-fails-CI acceptance criterion was verified locally; the workflow itself is unverified
   on actual GitHub Actions since nothing has been pushed. (Frontend lockfile item was already
   confirmed fixed during Task 1's investigation — not part of this task's remaining scope.)
5. ✅ **DONE (2026-09-26) — Sync observability.** `PlatformConnection` gained `lastSyncAt`,
   `lastSyncStatus` ("success"|"error"), `lastSyncError` (a fixed, safe message — never the raw
   exception, which is logged server-side via `console.error` instead), `messagesScanned`,
   `invoicesFound` — written by both `email-sync/sync-engine.ts` and `billing-sync/sync-engine.ts`'s
   outer catch/success paths, replacing both files' previous bare `catch {}` (S-17). Distinct from
   the pre-existing `lastVerifiedAt`/`lastError` (the credential's own health) — a connection can be
   "connected" while its most recent sync run still failed, and this now surfaces that.
   `automation-view.tsx` (the existing sync-status table) updated: real `lastSyncAt` preferred over
   the old inferred timestamp, the sync error shown inline under the status pill, invoice/message
   counts shown under "Last run", and — genuinely missing before this — a **Reconnect** button
   next to Disconnect whenever `status === "error"` (navigates to the Platforms page, reusing the
   existing connect flow rather than duplicating the Pipedream popup logic here).

   **Tested:** 3 new model-level vitest tests (success path clears a prior error + records counts,
   error path records a safe message, invalid status value rejected) — 17 tests total now passing.
   Backend `tsc`/`lint`/`build` clean; frontend `tsc`/`lint`/`build` clean (full production build,
   not just typecheck). Confirmed against a real existing connection in the database that the new
   fields are absent until a connection's next sync run (expected, additive, backward-compatible —
   the frontend correctly renders "—" until then).

   **Honest scope note:** this does not add new OAuth-revocation *detection* logic inside the sync
   loop itself — it relies on the existing verification mechanism (`getAccount().healthy`, already
   sets `status`/`lastError` on connect/reconnect) and makes sure the UI actually surfaces a
   Reconnect action when that status is seen, which it previously did not at all.
6. ✅ **DONE (2026-09-26) — Provenance schema + backfill.** Full detail in
   `flow/00-executive-summary.md` item #5: `Billing` gained `sourceMessageId`, `sourceThreadId`,
   `senderEmail`, `senderDomain`, `receivedAt`, `subject`, `extractionConfidence`, `extractionModel`,
   `extractedAt`, `evidence[]` (all optional/additive, no backfill migration needed);
   `ai-invoice-extractor.ts` gained a model-reported `confidence`; `sync-engine.ts` populates all of it
   on every email_sync write, including a new Gmail `threadId`/Outlook `conversationId` capture that
   wasn't being fetched before; `evidence` is a deterministic, sanitized, length-capped excerpt of the
   raw email body built in *code*, deliberately never asked of the AI model (avoids a second
   prompt-injection surface). Verified safe against API spoofing (zod strips unlisted fields, only the
   sync engine ever writes these). 4 new vitest tests, 21 total passing; `tsc`/`lint`/`build` clean.
   **Tests UX-005/006 remain unmet** — those are frontend trust-UX tests (a "view source email" link,
   an AI-vs-manual badge); this task was backend schema-and-wiring only, per its own scope — the data
   they'd need now exists, the UI itself is separate, later work (WP-5).
7. ✅ **DONE (2026-09-26) — Vendor domain model.** Full detail in `flow/00-executive-summary.md` item
   #9: new `Vendor` model + `services/vendors/vendor-resolver.service.ts` shared by both sync engines;
   `Billing` gained `vendor`/`vendorDomain` (additive, alongside the existing `vendorName`); real
   migration (`scripts/backfill-vendors.ts`) actually run against the live database (20 legacy records
   backfilled, 0 remaining); agent search widened to also match `vendorDomain` under the existing
   `customerName` parameter (a genuinely new Console-registered parameter name was out of this repo's
   reach — the tool's input schema lives in the Anthropic Console, not this codebase); analytics'
   "spend by platform" now groups by real vendor identity, not connection — the actual "double-
   counting" fix; frontend Billing search box bug (same root cause) fixed in the same task. 14 new
   tests (35 total). A real MongoDB partial-index bug (`$exists:false` unsupported) was caught by the
   test suite before it ever reached the live database; a second, unrelated pre-existing bug (`scripts/`
   never type-checked by any npm command) was found and the 3 latent errors it had been hiding fixed,
   flagged rather than silently restructured. Tests UX-004/ORG-023 (both frontend/permissions-facing,
   not built in this backend-and-migration-scoped task) remain open.
8. ✅ **DONE (2026-09-26) — `BillingEvent` log + status state machine.** Full detail in
   `flow/00-executive-summary.md` item #9a: new append-only `BillingEvent` model (11 event types) + a
   pure `deriveStatus()` implementing the exact 8-step algorithm from flow/05 §8, dual-written into new
   `Billing.derivedStatus*` fields — `status` itself untouched, genuinely shipped "behind a flag" as
   instructed. Wired into `email-sync/sync-engine.ts` (every write) and `billing.controller.ts`'s manual
   status edits (`user_correction`, always wins). 22 new tests (57 total) — GM-024/025/026/027 all
   directly covered by name, including the real bug this task exists to fix (a stale reminder after a
   payment confirmation no longer reverts it, at the state-machine level AND end-to-end through the real
   HTTP route). GM-028/029 (dedup-mechanics tests, P1 not P0) were already satisfied by earlier work
   (ProcessedMessage + the existing chronological-commit sort), not part of this task's own scope. Live
   database indexes applied. **Not done** (explicitly out of scope, not a gap): no backfill for existing
   legacy records (fabricating history would be guessing, not evidence); `billing-sync/sync-engine.ts`
   (129 adapters) not wired (separate, already-tracked `Billing`-vs-`UsageAccrual` issue — **this gap
   is now closed, see item #9d in `flow/00-executive-summary.md`, done 2026-10-01**); the actual
   cut-over to making `derivedStatus` the real `status` is its own future decision, not this task's.
9. ✅ **DONE (2026-09-26) — Prompt-injection defense + sender verification.** Full detail in
   `flow/00-executive-summary.md` item #9b: a system prompt + `<email>` delimiter framing added to
   `ai-invoice-extractor.ts`'s extraction call (the primary defense — email content was previously
   concatenated with zero framing, confirmed exactly as S-06 describes); every AI-extracted string field
   sanitized against an instruction-pattern list on ingest, AND independently again at the point a tool
   result renders into the Billing Advisor Agent's own context (S-07, two-layer defense in depth); real
   SPF/DKIM/DMARC capture from both Gmail's and Outlook's own `Authentication-Results` header (neither
   provider was fetching it before), plus a Reply-To/From domain mismatch check — either signal applies
   a confidence penalty, stored alongside a new `senderAuthResult`/`senderReplyToMismatch` provenance
   pair (S-08). 30 new tests (87 total) — an adversarial corpus of 8 injection phrasings against the
   sanitizer (one genuinely caught and fixed a real gap: "disregard THE above" didn't match the
   original pattern), a mocked-Anthropic-client test proving the actual request sent has the delimiter
   framing (not just that a string exists somewhere), and full SPF/DKIM/DMARC/confidence-penalty
   coverage. **The one acceptance criterion that couldn't be empirically verified at the time — a live
   call to the real Anthropic API with a deliberately adversarial email — is now ✅ done (2026-10-03)**,
   once the account's Anthropic-side credit-balance block resolved itself. Two real attacks run
   directly against the production `extractInvoiceFields` function (real Haiku 4.5, not mocked): a
   fabricated "$50,000 Paid AWS invoice" instruction embedded in a non-invoice email was rejected
   outright (`isBillingEmail: false`, every field null); a status-flip + customerName-corruption
   injection hidden in a genuine-looking $142.50 invoice was ignored, with the real fields (amount,
   vendor, Pending status) extracted correctly. See `flow/00-executive-summary.md` item #9 for the
   full detail.
10. ✅ **DONE (2026-09-29) — Stripe, minimum production-grade.** Full detail in
    `flow/00-executive-summary.md` item #4: new `Subscription` model + `stripe-subscription.service.ts`
    (Checkout in subscription mode, webhook-only `planTier` writes, out-of-order tolerance via
    `lastEventAt`, immediate Free-drop on a lapsed payment, live-key-outside-production guard);
    `updateMyPlan` now rejects any non-Free tier (400) — a paid tier is reachable only through the new
    `POST /api/plan/checkout`; a nightly credit-ledger reconciliation job
    (`credit-reconciliation-scheduler.ts`); frontend `plan-view.tsx` updated to route paid-tier
    switches through real Stripe Checkout (a required fix, not polish — the old code would have hit
    the newly-400-rejecting endpoint otherwise). 21 new tests (108 total) covering the roadmap's own
    named scenario matrix via hand-built Stripe event fixtures — **no live Stripe account exists in
    this environment**, so nothing here was verified against an actual live webhook delivery or
    Checkout redirect, only against realistic fixtures; "refund" (the matrix's 9th scenario) was not
    implemented, disclosed as a real gap. Both explicit user pre-conditions were honored: only
    proceeded on the user's own explicit go-ahead ("chalo phir Task 10 shuru karo"), and built on top
    of — not instead of — the already-~90%-complete credit-top-up flow per `flow/07`'s gap analysis,
    which was re-verified rather than redone.
11. ✅ **DONE (2026-10-04) — UsageAccrual UI (WP-4 gap closure).** Full detail in
    `flow/00-executive-summary.md` item #27: new `GET /api/usage-accruals` (latest-snapshot-per-
    connection aggregation) + a "Usage & balances" section on the Platforms page — closes the
    "UsageAccrual data exists on the backend but has zero UI" gap the user flagged directly. 1 new
    test (148 total), live-tested against real Atlas (seed → verify latest-only → cleanup → re-
    verify gone). **Still open, not this task's scope**: whether `Billing.derivedStatus` should
    become the real `status` field (task #8's own explicitly-deferred decision) remains unraised with
    the user; WP-5's live trust-surface test against a real Gmail-derived record remains blocked on
    the Pipedream production/reconnect issue (separate, business-side blocker).
12. ✅ **DONE (2026-10-04) — WP-4's last open decision: `derivedStatus` → `status` cutover, narrow
    scope.** Full detail in `flow/00-executive-summary.md` item #28: user was asked directly (via
    `AskUserQuestion`, not guessed) between a narrow bug-fix-only cutover and the full 11-state
    vocabulary expansion once investigation showed the literal "copy the field" plan would have broken
    validation/UI/notifications/analytics/the agent everywhere — chose narrow. New
    `mapDerivedStatusToBillingStatus()` maps the richer result back onto the existing 3-state `status`;
    `email-sync/sync-engine.ts`'s commit loop overwrites its own naive `status` write with the mapped,
    full-history-aware value — this is what actually fixes GM-027 on the real `status` field, not just
    the comparison-only `derivedStatus*` fields task #8 shipped. Scoped to email_sync only (manual
    edits unaffected; the 129 billing-sync adapters confirmed to never call `recordBillingEvent` at
    all, so zero effect there). 5 new tests (153 total, two consecutive full runs green) — including a
    new `sync-engine.test.ts` driving the real `syncConnectionEmail()` pipeline end-to-end (mocking
    only the Gmail/Outlook provider and the Anthropic call) to prove the fix through the real commit
    loop, not just the pure function. Live-tested against real Atlas with the actual production
    functions imported directly. **Deliberately not built**: the full 11-state vocabulary expansion
    across the whole app — explicitly declined by the user for now, logged as a future decision.
13. ✅ **DONE (2026-10-04) — The real-Gmail-inbox live test (closes WP-2/WP-4/WP-5's shared "never
    tested against a real inbox" gap) + WP-5 completed in full.** Full detail in `flow/00-executive-
    summary.md` items #29 and #30. A real invoice email, sent to the user's own real connected Gmail
    via the app's own Resend account, was found and processed by the real `syncConnectionEmail()`
    pipeline end-to-end (real Pipedream search, real Anthropic extraction, real status-cutover write,
    real provenance) — the one thing no prior live test in this session had actually exercised. Then
    WP-5's two remaining named gaps closed: duplicate flags + a non-destructive merge/unmerge (the
    user's own explicit choice when asked, over permanently deleting a record), and the "confirm
    detected vendors" onboarding step (`Vendor.confirmedAt`/`rejectedAt`, backfilled live for all 7
    pre-existing vendors so only genuinely new detections prompt going forward). 18 new tests (171
    total, two consecutive full runs green); backend+frontend `tsc`/`lint`/`build` clean; live-tested
    against real Atlas AND the real running server over real HTTP. **This completes WP-4 and WP-5 in
    full.** The only remaining gaps anywhere in WP-0 through WP-12: WP-9 has no live Stripe test (no
    live Stripe account exists in this environment), and WP-6/WP-10/WP-11 haven't been started.
14. ✅ **DONE (2026-10-04) — WP-7 completed in full: org-id consolidation + the intent router.** Full
    detail in `flow/00-executive-summary.md` item #31. `AssistantTool.run()` re-threaded to take the
    chat turn's own `organizationId` (already resolved once by `sendAgentMessage`) instead of each
    tool re-deriving it from a bare `userId` — closes the theoretical concurrent-org-switch race
    `flow/01` item #5 flagged, proven by a dedicated regression test that switches a user's active org
    mid-test and confirms a tool call explicitly scoped to the OLD org still returns the OLD org's
    data. New `intent-router.service.ts` deterministically answers `aggregate`/`lookup`/`explain`
    questions (reusing the agent's own underlying tool functions) at 0 credits, wired into both web
    and Slack chat ahead of the credit gate — `action`/`rule` deliberately left agent-routed, a
    disclosed scope limit. 20 new tests (191 total, two consecutive full runs green); live-tested
    against real Atlas and the real running server, including confirming the real Anthropic fallback
    path still spends real credits correctly for a non-deterministic question. **This completes WP-7
    in full.** WP-0 through WP-5, WP-7, WP-8, and WP-12 are now all done; only WP-9 (no live Stripe
    test) and the three never-started WPs (6, 10, 11) remain anywhere in the WP-0…WP-12 set.
15. ⚠️ **DONE (2026-10-04) — WP-6's PDF/attachment-parsing half** (the OTHER half, direct Gmail/
    Outlook OAuth, remains genuinely blocked on Google/Microsoft's external review process). Full
    detail in `flow/00-executive-summary.md` item #32. Gmail/Outlook both gained real attachment
    fetching (the bytes were already being pulled through the Pipedream proxy and discarded unused,
    per the audit's own finding) + `unpdf` text extraction, appended to the existing email body text
    the AI extractor already reads — no new prompt-injection surface, same existing defenses cover it.
    A real rejection is recorded: `pdf-parse@1.x` was tried first and failed to parse even a plain
    `pdfkit`-generated test PDF (a 2016-vintage vendored parser) — rejected rather than shipped broken,
    replaced with `unpdf`. 10 new tests (206 total, two consecutive full runs green); **live-verified
    against a real Gmail inbox**: an invoice PDF attached to a deliberately near-empty email — the
    audit's own "near-empty email with a PDF attached is invisible" failure case exactly — correctly
    produced a Billing record with every field (vendor, invoice number, amount, status) that existed
    ONLY inside the PDF, never in the email body.
16. ✅ **DONE (2026-10-05) — Billing Advisor Agent credit-accounting fixes (CLAUDE.md §10.3/§10.4).**
    Full detail in `flow/00-executive-summary.md` item #33. Two of the audit's four credit-accounting
    findings were still open (`MAX_ITERATIONS` already done 2026-10-01; the stale-cache gate race and
    `tokensToCredits` ignoring cache tokens/session-hour billing were not) — fixed both:
    `assertCreditBalance` now reads the live database balance instead of trusting a snapshot that can be
    up to 5 seconds stale (`auth-cache.ts`), closing the window where several concurrent requests could
    all pass the gate on the same stale "has credits" read; `consumeCredits` is now awaited (not
    fire-and-forget) inside a `try/finally` around the whole turn, so a mid-turn `session.error` still
    gets charged for tokens already spent instead of that cost vanishing untracked; `tokensToCredits`
    now factors in prompt-cache tokens and the $0.08/session-hour Managed Agents runtime dimension,
    both previously charged $0. 13 new tests (219 total, two consecutive full runs green); live-tested
    against real Atlas and the real running server — a real non-deterministic agent turn cost **8
    credits** post-fix vs. **1 credit** measured for a similar turn earlier this same session pre-fix,
    concrete evidence of the under-charge this closes, not just a theoretical improvement. **Explicitly
    out of scope**: a full reservation/lock-based credit system — the existing design already accepts a
    small single-turn overdraft as intentional; this closes the unbounded-magnitude bug (many stale-
    cached requests passing at once), not that already-accepted case.
17. ✅ **DONE (2026-10-05) — WP-11, the learning loop (flow/04 §7).** Full detail in `flow/00-
    executive-summary.md` item #34. The last never-started WP with a real spec. `SenderProfile`/
    `ClassificationFeedback` built; a human deleting an email_sync record (the one unambiguous "AI got
    this wrong" signal) increments false-positive counts in real time, a nightly job recomputes
    confirmed-invoice counts (3-day grace period) and applies the trust thresholds flow/04 specifies —
    suppressed senders are skipped before any AI call (0 credits), trusted senders get a confidence
    floor raised. `UserRule`'s domain-ignore capability folded into `SenderProfile.manuallySet` rather
    than a second model — a disclosed simplification, not a silent scope cut. 29 new tests (248 total,
    two consecutive full runs green); backend+frontend clean; live-tested end-to-end against real
    Atlas and the real server (3 real deletes → real false-positive count → real nightly-job suppression
    → real notification → real restore). **This closes the WP-0 through WP-12 set entirely** — every
    item has now had full completion, a deliberate documented scope decision, or a deliberate documented
    deferral; nothing remains silently untouched. Open items: WP-9 (no live Stripe test), WP-6 (direct-
    OAuth half blocked externally), WP-10 (deliberately deferred pending real usage).

---

## Reconciliation — where everything else already tracked actually fits

### Stripe (task 10 / WP-9) — explicit conflict with the canonical roadmap, resolved in the user's favor

The roadmap's own Gantt has WP-9 starting on day 31, in parallel with WP-4/5 on a second engineer.
**This was overridden by the user's explicit instruction** to wait ("Stripe wala kaam mujhe yaad
hai... wo bataun kya karna") until they gave specific instruction — which they did on 2026-09-29
("chalo phir Task 10 shuru karo"), at which point `flow/07-pricing-credits-stripe.md`'s gap analysis
(the credit top-up flow ~90% done; only the subscription/plan-tier piece unbuilt) was resumed from
exactly as this document anticipated. See task #10 above for what was actually built.

### The two "extra" items (not from the 12 documents) — where they'd slot in if picked up

- **Slack OAuth redesign** (`flow/extra-01`) — same underlying reasoning as WP-6 (direct OAuth beats
  a shared/manual connection method for a volume-heavy, provider-specific integration). Natural
  parallel to WP-6 if picked up, not before WP-4 (no hard dependency, but no urgency before the core
  domain work either).
- **Usage signal / forecasting** (`flow/extra-02`) — **explicitly placed at the very end by the user's
  own instruction**, after everything else including WP-11/WP-12.

### The 30/60/90 day framing (§3) — matches the WP order exactly, restated for calendar planning

Days 1–30: WP-0, 1, 2, 3 (stop the bleeding) · Days 31–60: WP-4, 5, (9 if unblocked) (trustworthy and
sellable) · Days 61–90: WP-6, 7, 8, 10 (defensible and scalable) · Beyond 90: WP-11, 12, then the
extra items.

### Every numbered "combined suggested order" item from `flow/00` through `flow/09` — superseded by this file

Each of those files ends with a locally-numbered list (1 through 50) that always deferred to "the
running order" without ever pointing at one authoritative structure. **This file is that structure.**
Going forward, when the user is ready to start implementation, the entry point is the "next 10
engineering tasks" list above — not a re-scan of nine separate files' numbered lists. Those lists
remain useful as the *detailed evidence* behind each task (which exact bug, which exact file:line),
but the *sequencing* question is answered here, once.

---

## Not yet approved for implementation — still awaiting the user's go-ahead

With this document processed, all of the roadmap-defining content from the 12-document set is now
fully reconciled into one place. Two documents remain (11 — Target Architecture, 12 — Launch
Readiness) — both expected to be largely cross-referential at this point, since their content
(domain model, agent architecture, release gates) has already surfaced across `flow/00-09`.
