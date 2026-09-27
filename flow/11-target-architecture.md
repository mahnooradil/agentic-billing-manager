# Flow for Document 11 — Target Architecture

**Read:** in full, line by line. Most of this document is content already fully transcribed elsewhere
— it's the audit's own consolidated design reference, and earlier documents already quoted large
parts of it directly. No new code verification needed (pure design content, built on already-confirmed
facts).

---

## Cross-reference — content already fully captured, not repeated

| This doc's section | Already captured in |
|---|---|
| §4 Domain model (`Vendor`, `BillingEvent`, `Billing`, `UsageAccrual`, `ProcessedMessage`, `SenderProfile` — full schemas) | `flow/05-email-invoice-intelligence.md` — transcribed in full there |
| §5 Ingestion pipeline (layered, fingerprint formula, hardened extraction prompt) | `flow/05-email-invoice-intelligence.md` |
| §6 Agent architecture (intent router, invariants) | `flow/04-ai-agent-and-memory-audit.md` §8 |
| §7 Learning architecture (three tiers, feedback loop) | `flow/04-ai-agent-and-memory-audit.md` §7 |
| §9 Infrastructure evolution table | `flow/06-cost-and-unit-economics.md` — **identical table, same source content in both documents** |

---

## Genuinely new content — first full appearance in this file structure

### §1 — Component-by-component verdict (Keep/Improve/Refactor/Replace/Defer)

The one-glance answer to "what happens to each piece of the current stack":

| Component | Verdict | Reasoning |
|---|---|---|
| Express 5 + TypeScript + Mongoose | **KEEP** | Fits the domain |
| MongoDB Atlas | **KEEP** | Document shape suits invoices/events well |
| Next.js frontend | **KEEP** | Well built, no rewrite warranted |
| Controllers → Mongoose directly | **IMPROVE, selectively** | Fine for `Platform`/`Notification`/`Support`/`UserSettings`; extract a service layer **only** for billing |
| `Billing` model | **REPLACE** | Split into `Billing` (projection) + `BillingEvent` (truth) + `UsageAccrual` |
| Email sync engine | **REFACTOR** | Layered pipeline, processed-message store, deterministic pre-filter |
| Claude Managed Agents | **KEEP, narrow** | Reasoning only — the hybrid-router decision already agreed with the user |
| Claude Haiku extraction | **KEEP, optimise** | Add caching, batching, vendor priors |
| Pipedream — 129 adapters | **KEEP** | Low call volume, huge provider surface |
| Pipedream — Gmail/Outlook | **REPLACE** | ~99% of proxy volume, two providers with real sync primitives |
| In-process schedulers | **REPLACE at ~50 customers** | Not before — same trigger already noted in `flow/06` |
| Auth/session/tenancy | **KEEP** | Correct; add rate limiting + single resolution path |
| Credit ledger | **KEEP** | Well built; fix the check and meter around it |
| Event bus | **KEEP** | Small and correct; add debouncing |
| Vector database | **DEFER indefinitely** | Solves no current problem |
| Microservices/Kubernetes | **DEFER indefinitely** | No boundary under independent load |
| Model fine-tuning | **DEFER indefinitely** | The gap is context, not capability |

### §2 — System topology (first full diagram in this structure)

```
Next.js (Vercel) ──┐
Slack app ──────────┤──> API process (auth · tenancy · rate limit · validation)
                          │
                          ├─ identity · billing-domain · invoice-intelligence
                          ├─ agent · integrations · notifications
                          └─ payments · analytics
                          │
                          ├──> MongoDB Atlas (direct)
                          └──> enqueue ──> Redis/BullMQ ──> Worker process
                                            (same codebase, different entrypoint)
                                              ├─ ingestion jobs · adapter sync
                                              └─ scheduled rules · recommendation batch
                                            ──> MongoDB Atlas

invoice-intelligence ──> Anthropic Messages API + Batch (extraction)
agent ──> Anthropic Managed Agents (narrowed, per the router decision)
integrations ──> Google OAuth · Microsoft OAuth · Pipedream Connect (129 adapters)
payments ──> Stripe
```

**Why split the worker — the core justification, worth keeping verbatim:** schedulers currently run
inside the API process via `setInterval` with no distributed lock; a second replica doubles every
sync and every credit deduction. This is a **deployment change** (same codebase, different
entrypoint), not a rewrite — ties directly to the ~50-customer Redis trigger already tracked.

### §3 — Module boundaries (first full table in this structure)

| Module | Owns | Exposes | May not |
|---|---|---|---|
| `identity` | `User`, `Session`, `Otp`, `Organization`, `Membership`, `Invitation` | `resolveAuthContext()`, `requireRole()` | Read business data |
| `billing-domain` | `Billing`, `BillingEvent`, `Vendor`, `UsageAccrual` | `recordEvent()`, `queryInvoices()`, `getEvidence()`, `applyCorrection()` | Call LLMs or providers directly |
| `invoice-intelligence` | `ProcessedMessage`, `SenderProfile`, `ClassificationFeedback` | `classify(message) → Classification` | Write `Billing` directly — emits events only |
| `agent` | `AgentSession` | `answer(orgId, userId, text)` | Mutate business data |
| `integrations` | `PlatformConnection` | `listMessages()`, `getMessage()`, `fetchAdapterRecords()` | Interpret content |
| `notifications` | `Notification`, `UserSettings` | `raise(signature, …)` | Decide business rules |
| `payments` | `Subscription`, `StripeEvent`, `CreditTransaction` | `grantCredits()`, `reserveCredits()`, `getEntitlements()` | Be bypassed for tier writes |
| `analytics` | — (reads `billing-domain`) | `overview()`, `vendorBreakdown()` | Write anything |

**Enforcement:** an ESLint `no-restricted-imports` rule per module directory — cheap, and it's what
stops these boundaries eroding within three months. **The one service layer actually worth
extracting is `billing-domain`** — today `sync-engine.ts`, `billing.controller.ts`,
`billing-actions.tool.ts`, and `notification-engine.ts` all write billing status by four different
rules (already confirmed in `flow/02-code-and-module-audit.md` §18's architecture assessment) — that
inconsistency is the actual coupling to fix, not a general push toward layering for its own sake.

### §8 — Security architecture, consolidated into one target spec

Pulls together items already individually tracked across `flow/00-03` into a single reference table —
useful as a checklist when the security-hardening work actually happens:

| Control | Target specification | Already tracked as |
|---|---|---|
| Auth codes | `crypto.randomInt(100000, 1000000)` | `flow/00` #2 |
| Attempt limiting | Atomic `findOneAndUpdate({attempts:{$lt:5}},{$inc:{attempts:1}})` | `flow/00` #2 |
| Rate limiting | Redis-backed, every unauthenticated route + `/agent/chat`, `/recommendations/refresh`, `/support`, `/organization/invitations`, `/slack/link-code`, Slack DM path | `flow/02` item 1, `flow/03` item 26 |
| Proxy | `app.set('trust proxy', 1)` | `flow/02` item 15 |
| Secret encryption | Required key, HKDF-SHA256, versioned payload | `flow/02` item 22 |
| Tenancy | Single resolution path (`req.organization`) everywhere | `flow/01` item 5 |
| RBAC | Billing mutations gated to owner/admin, soft delete + audit log | `flow/02` item 5, `flow/03` (S-18 area) |
| Prompt injection | System-prompt framing, delimiters, sanitization, auth results | `flow/03` §3 |
| Stripe | Raw-body verification, `StripeEvent` before processing, webhook-only tier writes | `flow/07` (on hold) |
| Headers | CSP via `helmet`, body size cap | `flow/03` item 27 |
| Index integrity | `syncIndexes()` at boot + startup assertion | `flow/00` #1 |

No new items — this table's value is being the **one place to check off every security item at once**
when that phase of work actually starts, rather than hunting across multiple files.

---

## Updated combined suggested order

No new items from this document — everything actionable here was already captured with its own
number in earlier files. This document's contribution is organizational (the three tables above),
not additional scope.

**Not yet approved for implementation.** One document remains: 12 — Launch Readiness.
