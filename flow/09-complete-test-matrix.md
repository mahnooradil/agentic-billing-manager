# Flow for Document 09 — Complete Test Matrix

**Read:** in full, line by line (all ~300 test cases across 10 categories). **Inspected against live
code:** confirmed zero testing infrastructure exists — searched both `package.json` files for
`vitest`/`jest`/`mocha`/`playwright`/`supertest`/`mongodb-memory-server`/`autocannon`: no matches, no
`test` script, no config file for any of them anywhere in the repo. Matches the document's own
"repository contains zero tests" claim exactly.

---

## This document is different in kind from documents 00–08 — read this before anything else

Every prior document described **bugs in existing code**. This document describes **tests that don't
exist yet**, for both real bugs (confirmed already) and correct behavior that needs to stay correct.
There is nothing here to "verify against the code" the way earlier documents worked, because the
subject of this document — the test suite — is itself 100% unbuilt. The actual action item is: build
this test suite, using the stack and ordering specified below, **alongside** the fixes already tracked
in documents 00–08 — not as a separate phase that happens after everything else.

---

## What the bold (currently-failing) test IDs actually are — cross-referenced, not new findings

Every **bold** row in this document is a test that would fail today, and every one of them corresponds
to a bug **already confirmed** in an earlier flow file. A representative mapping (not exhaustive — the
full ~60 bold rows all trace back to the same handful of root causes already tracked):

| Bold test IDs | Bug already confirmed in |
|---|---|
| AUTH-008, AUTH-011, AUTH-014, AUTH-015 | `flow/00-executive-summary.md` #2 (OTP: `Math.random`, non-atomic attempts, no rate limit) |
| ORG-013 (and the tenancy-adjacent ones) | Already re-confirmed safe in `flow/03-security-audit.md` — no IDOR found; this test would actually **pass** today per that inspection, contrary to what "bold = currently fails" might suggest for a pure tenancy-crossing case. Worth a precise re-check once real tests exist rather than assuming either way. |
| GM-004, GM-005, GM-006, GM-010b | `flow/00-executive-summary.md` #3 / `flow/05-email-invoice-intelligence.md` (re-extraction loop, reconnect watermark reset) |
| GM-019 | `flow/00-executive-summary.md` #7 (PDF/attachment parsing missing) |
| GM-026, GM-027, GM-028 | `flow/05-email-invoice-intelligence.md` (state machine / dedup gaps) |
| GM-029 | `flow/05-email-invoice-intelligence.md` §5 (Gmail+Outlook dedup, deliberately namespaced apart today) |
| OL-001, OL-002 | `flow/05-email-invoice-intelligence.md` (unverified Graph `$search` ordering assumption) |
| ADV-011, ADV-013, ADV-016 | `flow/03-security-audit.md` (S-06 prompt injection, S-07 unescaped tool results, S-08 sender spoofing) |
| ADV-026 | `flow/01-current-architecture.md` #1 (no `MAX_ITERATIONS`) |
| CR-004, CR-005, CR-012, CR-016 | `flow/00-executive-summary.md` #4, `flow/02-code-and-module-audit.md` (credit-cycle, reservation, free self-upgrade) |
| CR-020, CR-024 | `flow/07-pricing-credits-stripe.md` (Stripe not yet built for plan-tier gating — on hold per user instruction) |
| AN-001 | `flow/02-code-and-module-audit.md` #3 (mixed-currency sum) |
| AN-005, AN-006, AN-007 | `flow/00-executive-summary.md` / `flow/05-email-invoice-intelligence.md` (129-adapter mislabeling, usage-vs-invoice split) |
| INF-001…004 | `flow/00-executive-summary.md` #1 (indexes never build in production) |
| INF-013, INF-016 | `flow/06-cost-and-unit-economics.md` (in-process schedulers, no worker/lock — the Redis trigger point) |
| INF-024 | `flow/00-executive-summary.md` — **already confirmed fixed** during this inspection (a real `npm ci` was run and succeeded) |
| UX-004 | `flow/00-executive-summary.md` / `flow/04-ai-agent-and-memory-audit.md` (the "Netflix" search bug) |

**The point of this cross-reference:** writing the actual test files should happen as each corresponding
fix is implemented (the test proves the fix works and stays working), not as a giant separate testing
sprint disconnected from the fixes themselves.

---

## The parts of this document that are genuinely new content (not just test cases for known bugs)

### The recommended stack

Vitest + `mongodb-memory-server` + supertest for unit/integration/API · Playwright for E2E · `autocannon`
for load · a private, real-anonymized-email fixture corpus specifically for the AI evaluation suite
(§5). None of this exists yet — confirmed.

### The AI evaluation corpus (§5) — a distinct, standalone deliverable

A ≥500-email corpus, stratified across 13 categories (real invoices in body/PDF/HTML/link form,
receipts, reminders, failed payments, refunds, subscription events, quotes, marketing mentioning
"invoice," bank alerts, support tickets, forwarded invoices, fraudulent/spoofed invoices, delivery
notifications), split 70/30 dev/holdout, re-run on every prompt or model change. **This is not
optional infrastructure — it's the only way to know if a prompt change to `ai-invoice-extractor.ts`
(already tracked in document 05's flow file) actually improved things or made them worse.** Explicit
numeric targets given, with reasoning for each (precision ≥0.97, recall ≥0.85, amount accuracy ≥0.98,
currency accuracy ≥0.99, vendor accuracy ≥0.92, due-date accuracy ≥0.90, status accuracy ≥0.93, false-
Paid rate ≤0.01). Needs its own dedicated collection effort — this can start independently of any code
change, in parallel with everything else, since it doesn't depend on any fix landing first.

### The automation priority waves (§11) — the actual sequencing guidance

| Wave | Contents | When |
|---|---|---|
| 1 | INF-001…004, AUTH-008/011/014/015, GM-004/005/006/010b | Week 1 — these are literally the acceptance criteria for the first fixes already at the top of the combined order (indexes, OTP, sync loop) |
| 2 | All ORG-0xx cross-tenant cases | Weeks 2–3 — **lock tenancy down with real tests before the domain-model rebuild starts touching every query** — this is a hard prerequisite worth respecting, not just a nice-to-have |
| 3 | GM/OL sync suites, AI evaluation corpus | Weeks 4–6 — needed before the state-machine rewrite so regressions are provable, not just hoped against |
| 4 | ADV-0xx, CR-0xx Stripe matrix | Weeks 7–8 — before public launch and before taking money |
| 5 | INF performance, UX manual | Ongoing, quarterly |

**This wave ordering should be treated as binding** whenever actual implementation starts — Wave 2
specifically (tenancy tests before the domain-model rebuild) is a real, reasoned dependency, not
arbitrary sequencing: once `Billing`'s shape changes, every tenancy-scoping query changes too, and
having tests locked in first is what makes it possible to prove nothing broke.

---

## Updated combined suggested order (adds to the running list)

48. Stand up the test framework itself (Vitest + `mongodb-memory-server` + supertest, CI wiring) —
    this is the same item already at position in `flow/00-executive-summary.md`'s order (#6 in that
    file's numbering, "Tests + CI"); this document is the detailed spec for what goes in it.
49. Start AI-evaluation-corpus collection **immediately, in parallel with everything else** — it has
    no code dependency, and the earlier it starts the sooner prompt/model changes (already planned in
    document 05's extraction-quality fixes) can be measured instead of guessed at.
50. **Treat each already-tracked fix's corresponding test IDs (per the mapping above) as that fix's
    acceptance criteria** — not a separate item, a way of doing the fixes already in the list.

**Not yet approved for implementation — still awaiting the user's go-ahead on where to start.**
