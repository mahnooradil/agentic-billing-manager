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
| 0 | Documentation correction | 0.2 | none | Delete `ARCHITECTURE.md`, add `DECISIONS.md` D-004, fix `README.md`'s "production-ready" claim (`flow/00` #11, full D1–D11 table in `flow/01` §25.1) |
| 1 | Production integrity & auth hardening | 1.5 | none | Index migration, OTP fixes, rate limiting, `trust proxy`, session/OTP TTLs, CI setup (`flow/00` #1–2, `flow/02` items 15/16-ish, `flow/03` items 24/27-29) |
| 2 | Ingestion cost & completeness | 1.5 | WP-1 | `ProcessedMessage` store, watermark-advance fix, reconnect fix, `lastSyncError` surfaced (`flow/00` #3, `flow/02` item 6/16, `flow/05` items 34/37) |
| 3 | Analytics correctness | 0.8 | WP-1, ∥ WP-2 | Remove mixed-currency sum, compound indexes, server-side pagination (`flow/02` items 19/20/21, `flow/08` item 42) |
| 4 | **Domain model rebuild** | 3.0 | WP-1 | `Vendor`, `BillingEvent`, `UsageAccrual`, reshaped `Billing`, `deriveStatus()` (`flow/05`'s full target schema + state machine) — **highest risk, time-box with a mid-point review** |
| 5 | Trust surfaces | 1.5 | WP-4 | Origin badges, confidence, "view source email," new dashboard hierarchy (`flow/08` items 45/46/47) |
| 6 | Recall: attachments & providers | 2.5 | WP-2, WP-4 | PDF parsing, direct Gmail/Outlook OAuth (`flow/05` item 38) — **same reasoning already applied to the Slack redesign** (`flow/extra-01`) |
| 7 | Agent architecture | 2.0 | WP-4, ∥ WP-6 | Intent router, delete `getOrganizationIdForUser`, `AgentSession` re-keyed, `MAX_ITERATIONS=8`, config in repo (`flow/01` items 12/13, `flow/04` items 31/32) |
| 8 | Injection defense & sender verification | 1.0 | WP-6, WP-7 | System-prompt framing, SPF/DKIM/DMARC capture, output sanitization (`flow/03` §3, `flow/02` item 8) |
| 9 | **Payments** | 2.5 | WP-1, ∥ WP-4/5 | Full Stripe subscription/plan-tier architecture (`flow/07`'s §5 gap analysis — **the ~10% not already built**) — **ON HOLD, see note below** |
| 10 | Scale | 2.0 | WP-2 | Worker process, Redis/BullMQ, distributed locks (`flow/06`'s infra-evolution table — the ~50-customer trigger) |
| 11 | Learning loop | 2.0 | WP-4, 5, 8 | `SenderProfile`, `ClassificationFeedback`, `UserRule`, nightly job (`flow/04` item 33) |
| 12 | Privacy & retention | 1.0 | WP-4 | Data export, transactional deletion, audit log, consent copy (`flow/03`'s privacy/retention section) |

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
   (129 adapters) not wired (separate, already-tracked `Billing`-vs-`UsageAccrual` issue); the actual
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
   coverage. **One acceptance criterion could not be empirically verified**: a live call to the real
   Anthropic API with a deliberately adversarial email (to confirm the MODEL itself resists the
   injection, not just that the request is shaped correctly) failed with "credit balance too low" —
   an account-level constraint, not a code issue. What's verified is the request-shape tests above;
   the model's own behavior against a live adversarial email is unconfirmed until the account has
   credit again — flagged honestly rather than assumed.
10. **Stripe, minimum production-grade** — needs #1, #4. Tests: CR-019…024 + the 15-row matrix in
    `flow/07-pricing-credits-stripe.md`. **On hold — see note below.**

---

## Reconciliation — where everything else already tracked actually fits

### Stripe (task 10 / WP-9) — explicit conflict with the canonical roadmap, resolved in the user's favor

The roadmap's own Gantt has WP-9 starting on day 31, in parallel with WP-4/5 on a second engineer.
**This is overridden by the user's explicit instruction** ("Stripe wala kaam mujhe yaad hai... wo
bataun kya karna") — nothing in that track proceeds until they give specific instruction, regardless
of what the canonical roadmap's own timing would otherwise suggest. When they do give that
instruction, `flow/07-pricing-credits-stripe.md`'s gap analysis (the credit top-up flow is ~90% done;
only the subscription/plan-tier piece is unbuilt) is what to resume from.

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
