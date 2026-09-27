# Flow for Document 12 — Launch Readiness

**Read:** in full, line by line. **This is the final of the 12 source documents.** No new code
verification needed — this document is a summary/scoring compilation over everything already found
across `flow/00-11`. What follows is only the organizational structure not yet transcribed anywhere
else, plus the closing status of the whole 12-document review.

---

## §1 — Launch blocker checklist, grouped by launch stage (a different, useful cut of the same facts)

Every item below already has its own detailed entry in an earlier flow file — this table's value is
answering "what do I need before X specifically," which the WP/dependency ordering in
`flow/10-remediation-roadmap.md` doesn't directly answer.

| Before... | Issue | Already tracked in |
|---|---|---|
| **Internal testing** | Indexes not built in prod | `flow/00` #1 |
| | Frontend `npm ci` fails | **Already confirmed fixed** during this review — no longer blocking |
| | Silent `catch{}` in sync engine | `flow/01`, `flow/02` |
| | `CLAUDE.md` pointing at the wrong architecture doc | Already corrected in an earlier session; `docs/ARCHITECTURE.md` itself still needs the WP-0 rewrite |
| **Private beta** | OTP predictability/rate-limit/atomicity | `flow/00` #2 |
| | Re-extraction loop | `flow/00` #3 |
| | Reconnect wipes watermark | `flow/02` item 6 |
| | No provenance | `flow/00` #5 |
| | Vendor model inverted | `flow/00` #9 |
| | Mixed-currency dashboard sum | `flow/02` item 3, `flow/08` item 42 |
| | No TTL on `Session`/`Otp` | `flow/03` item 29 |
| **Accepting payments** | No Stripe (plan-tier gating) | `flow/07` — **on hold per user instruction** |
| | Free self-upgrade | `flow/00` #4 |
| | Annual credit cycle | `flow/00` #4 |
| | No credit top-up flow | `flow/07` — **already ~90% built, uncommitted, on hold** |
| | No webhook-event ledger | `flow/07` — **already built** (`StripeProcessedEvent`), confirmed working |
| **Public launch** | Prompt injection / sender verification | `flow/03` §3 |
| | No PDF parsing | `flow/00` #7 |
| | Outlook ordering assumption unverified | `flow/05` §9 |
| | Sequential sync / in-process schedulers | `flow/06` (the ~50-customer Redis trigger) |
| | Zero tests, zero CI | `flow/09` |
| | Key rotation impossible | `flow/02` item 22 |
| | No data retention/deletion policy | `flow/03` §7 |
| **Can wait until growth** | Compound index tuning beyond the required set, job-queue autoscaling, analytics caching, i18n consistency, dependency advisories, dead-code cleanup, accessibility pass, soft delete with undo | Various, all low-priority items already noted across earlier files |

## §2 — Release gates (first full appearance in this file structure)

| Gate | Requires | Criterion |
|---|---|---|
| **G1 — safe to run** | WP-0, 1, 2, 3 | All P0s closed; CI green; a large mailbox syncs to completion without exhausting credits |
| **G2 — private beta** | +WP-4, 5 | Data is verifiable; vendor queries work; trust surfaces live |
| **G3 — accept payments** | +WP-9 | Stripe test-mode matrix passes; tier writable only by webhook — **on hold** |
| **G4 — public launch** | +WP-6, 7, 8, 10 | Adversarial suite passes; evaluation targets met; 2,000 connections sync inside the interval |
| **G5 — growth** | +WP-11, 12 | Learning loop measurable; retention policy enforced |

Maps directly onto `flow/10-remediation-roadmap.md`'s WP table — these are the same work packages,
now framed as go/no-go checkpoints rather than a build sequence.

## §3 — Full score table with reasoning (first full appearance in this file structure)

| Dimension | /10 | Why |
|---|---|---|
| Product usefulness | 3 | Real value exists but recall gaps and untrustworthy status undermine reliance |
| Invoice detection | 3 | Keyword search + no attachment parsing is a structural ceiling; 90-day window; incomplete above 200 emails |
| Invoice status accuracy | 2 | Single-email guess, no confidence, no evidence, no state machine |
| Email integrations | 5 | Gmail solid, clean abstraction; Outlook rests on an unverified assumption; reconnect wipes watermark |
| Agent intelligence | 5 | Tool-calling real and org-scoped, propose-then-confirm is good; vendor-search gap cripples the flagship query |
| Agent personalization/learning | 1 | Effectively none — corrections change nothing |
| Analytics | 6 | Multi-currency grouping correct in the engine; undermined by primary-currency filtering + adapter date corruption |
| Automation | 4 | Correctly rule-based with good dedup; no user-definable rules; "sync is broken" alert doesn't exist |
| Security | 3 | HTTP-layer tenancy genuinely good; auth primitives weak, prompt injection unmitigated |
| Multi-tenancy | 7 | Correctly applied, no IDOR found; two seams mitigated not structurally prevented |
| Reliability | 3 | `catch{}` everywhere, no sync error surface, single-instance schedulers, non-transactional cascades |
| Performance | 3 | Unbounded endpoints, client-side filtering, missing compound indexes, full aggregation on every event |
| Scalability | 2 | Sequential sync pass; a second replica doubles everything |
| Cost efficiency | 2 | 24× re-extraction, no caching/batching/turn cap/summarization/deterministic routing |
| UI/UX | 6 | Clean, consistent, real loading/error/empty states, no XSS; let down by the search bug + buried IA |
| Onboarding | 3 | None exists — no guided sync, no privacy explanation, no progress indicator |
| Pricing readiness | 2 | Plans exist and enforced, but annual AI credits against monthly billing; underpriced |
| Stripe/payment readiness | **0** | Doesn't exist as a plan-tier gate; plans free to self-assign |
| Production readiness | 2 | Blocked on index building alone; compounded by zero tests/CI |

## §4 — Founder product review (business framing — distinct from document 08's UX-framed founder review)

- **Ideal customer:** a 10–50 person company with 20–60 SaaS subscriptions, one person nominally
  responsible for vendor spend with no tooling.
- **Why would they pay?** The first sync reveals something they didn't know — a forgotten
  subscription, a missed price increase, a duplicate charge. That moment is the product; everything
  else is retention.
- **Strongest feature:** automatic invoice discovery from email — the one thing a spreadsheet can't
  do.
- **Weakest feature:** the AI agent — not badly built (propose-then-confirm is "the best architecture
  decision in the codebase"), but expensive, mostly unnecessary for the questions it's asked, and its
  flagship query doesn't work yet.
- **What prevents trust?** No provenance — a CFO can't check the work.
- **What prevents scaling?** Sequential sync loop + in-process schedulers, both fixable in ~2 weeks.
- **What prevents profitability?** The 24× multiplier (worth ~48 margin points) + no payment
  mechanism.
- **Differentiation verdict:** *not yet* — without provenance and learning it's "a worse Ramp expense
  view with an extra chat box." With them: "we find every invoice, show you the proof, and get better
  at your vendors over time" — a position the audit argues card-transaction-first incumbents are
  structurally worse at matching.
- **What to stop building:** more Pipedream adapters (129 already exceeds any customer's need), more
  agent surface area, more UI polish.
- **What to build next:** provenance → vendor model → event log, in that order — the foundation every
  other differentiated claim depends on. (Same order already reflected in
  `flow/10-remediation-roadmap.md`'s next-10-tasks list.)

## §5 — Final verdict table

| Question | Answer |
|---|---|
| Would I launch this today? | **NO** |
| Would I accept paying customers today? | **NO** |
| Would I trust it with my company's invoices today? | **NO** |
| Is the architecture capable of becoming the intended product? | **YES, WITH CHANGES** |

Five biggest reasons / five highest-ROI improvements / five biggest technical risks / five biggest
business risks — all already individually tracked across `flow/00-11`; no new items, this section is
the audit's own "top 5 of each" summary rather than new evidence.

---

## §6 — Closing read (verbatim framing worth keeping)

*"You have built roughly 70% of a good SaaS chassis and roughly 20% of the product in the brief...
none of the P0s are architectural. They are four bugs and a missing migration. The expensive work is
the domain model, and that is a rewrite of one collection — not the system."*

This is the same framing already opening `flow/00-executive-summary.md` §0 — the audit's verdict is
internally consistent from its first document to its last.

---

# All 12 source documents are now processed

| # | Document | Flow file |
|---|---|---|
| 00 | Executive Summary | `flow/00-executive-summary.md` |
| 01 | Current Architecture | `flow/01-current-architecture.md` |
| 02 | Code and Module Audit | `flow/02-code-and-module-audit.md` |
| 03 | Security Audit | `flow/03-security-audit.md` |
| 04 | AI Agent and Memory Audit | `flow/04-ai-agent-and-memory-audit.md` |
| 05 | Email and Invoice Intelligence | `flow/05-email-invoice-intelligence.md` |
| 06 | Cost and Unit Economics | `flow/06-cost-and-unit-economics.md` |
| 07 | Pricing, Credits and Stripe | `flow/07-pricing-credits-stripe.md` (Stripe on hold) |
| 08 | UI/UX and Product Audit | `flow/08-ui-ux-product-audit.md` |
| 09 | Complete Test Matrix | `flow/09-complete-test-matrix.md` |
| 10 | Remediation Roadmap | `flow/10-remediation-roadmap.md` — **the master sequence** |
| 11 | Target Architecture | `flow/11-target-architecture.md` |
| 12 | Launch Readiness | `flow/12-launch-readiness.md` (this file) |
| extra | Slack OAuth redesign | `flow/extra-01-slack-oauth-redesign.md` |
| extra | Usage signal / forecasting | `flow/extra-02-usage-signal-and-forecasting.md` (deferred to the end) |

**Entry point for implementation, whenever the user assigns it:**
`flow/10-remediation-roadmap.md`'s "next 10 engineering tasks, in exact required order."

**Nothing has been implemented.** Every flow file across this entire review is read-only analysis,
cross-checked against the live codebase where a code claim could be verified. No code has been
changed, no commits made, per the user's standing instruction to wait for explicit assignment before
building anything.
