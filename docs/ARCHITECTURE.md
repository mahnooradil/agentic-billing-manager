# System Architecture

> **Status: current, not frozen.** This document used to describe a target
> architecture (LangGraph on Qwen 3 Instruct) that was never built — see
> [`DECISIONS.md`](./DECISIONS.md)'s **D-004**, which formally supersedes the
> original D-001 architecture decision below. This rewrite reflects what is
> actually implemented today, verified against the live codebase (last
> checked 2026-10-01).
>
> **[`../CLAUDE.md`](../CLAUDE.md) is the single source of truth** for how
> this project works, including the full phase-by-phase build history. This
> file is a short, high-level map of the real system — go to `CLAUDE.md` for
> module-level detail, conventions, and the current phase status log.

## High-Level Data Flow

```
                    User
                     │
                     ▼
              Next.js 16 (Frontend)
        React 19 · TypeScript · Tailwind v4 · shadcn/ui (base-nova / Base UI)
                     │
                     ▼
         Node.js + Express 5 Backend (TypeScript, Mongoose)
   Passwordless OTP auth · multi-org tenancy · REST APIs · cron schedulers
                     │
          ┌──────────┼──────────────────────┐
          ▼          ▼                      ▼
   Billing-sync   Email-sync           Platform Connections
  (129 Pipedream  (Gmail/Outlook via   (API-key or Pipedream-
   adapters, one  Pipedream OAuth,     managed OAuth; encrypted
   per platform)  AI-parsed invoices)  credentials at rest)
          │          │
          └────┬─────┘
               ▼
          Billing collection (MongoDB Atlas)
   provenance trail · vendor identity · BillingEvent log (Task 6-8)
               │
               ▼
         Analytics Engine
  per-currency totals · spend-by-vendor · monthly trend · status breakdown
               │
               ▼
     Recommendation + Notification Engines
      (event-bus driven, rule-based, no AI call for either)
               │
               ▼
      Billing Advisor Agent
   Claude Managed Agents session per user, custom read-only + propose-only
   tools (never mutates data directly — the chat UI's confirm button calls
   the same authenticated REST endpoints the Billing page itself uses)
               │
               ▼
     Next.js Dashboard UI (+ Slack DM chat, same agent, same tools)
```

Payments (Stripe) and credit metering sit alongside this flow rather than
in it: Stripe Checkout (one-time credit top-ups and recurring plan-tier
subscriptions) plus a signed webhook are the only things allowed to change
an organization's `planTier` or `creditsBalance`.

## What's actually implemented vs. what the original blueprint claimed

| Original blueprint said | What's actually built |
| --- | --- |
| LangGraph AI Agent + Qwen 3 Instruct | Claude Managed Agents (Billing Advisor Agent), Claude Haiku 4.5 for email extraction — see D-004 |
| JWT + bcrypt auth | Passwordless OTP auth (no password field exists anywhere) + Google Sign-In |
| Generic "Third-Party APIs" via one Adapter Layer | 129 named billing-sync adapters (Pipedream Connect Proxy) + a separate Gmail/Outlook email-sync fallback, not one generic layer |
| Forecast Engine, Cost Optimizer (Analytics Engine sub-modules) | Never built — the real Analytics Engine does per-currency totals, spend-by-vendor, monthly trend, and status breakdown; no forecasting or optimization logic exists |
| Single-tenant ("the user") | Multi-organization tenancy — every business collection is scoped by `organization`, a user can belong to more than one |
| No payments | Stripe: one-time credit top-ups (Checkout, webhook-granted) + recurring Pro/Business subscriptions (webhook is the only writer of `planTier`) |

## Layer Responsibilities (as built)

### Billing-sync adapters
129 platform-specific adapters pull a connected platform's own billing/usage
data via Pipedream's Connect Proxy, normalized into `Billing` with
`source: "auto_sync"`. Known limitation (tracked in the audit backlog, not
yet fixed): most adapters model usage/balance rather than a discrete
invoice — see `CLAUDE.md` §10.3 for the full finding.

### Email-sync (Gmail + Outlook)
A fallback channel for platforms with no billing-sync adapter: scans a
connected inbox for invoice-like emails via Pipedream OAuth, extracts
billing fields with a forced-tool-call Claude Haiku call (system-prompt +
delimiter framed against prompt injection — Task 9), and records a full
provenance trail (source message, sender auth results, confidence) plus an
append-only `BillingEvent` log that a separate `deriveStatus()` function can
derive an independent status from (dual-written, not yet the source of
truth — Task 8).

### Vendor identity
A real `Vendor` collection (Task 7) gives the actual counterparty a bill is
from (Netflix, AWS, ...) a shared identity across every connection that
surfaces it, instead of grouping by connection the way the original
"Adapter Layer" blueprint implied.

### Analytics Engine
Read-only aggregation over `Billing`: per-currency totals, spend-by-vendor,
monthly trend, status breakdown, rule-based insights. No AI call, no
forecasting.

### Recommendation + Notification Engines
Event-bus-driven (not polling, not AI-triggered): business-data-changed
events regenerate recommendations; both engines are rule-based, dedup by
signature, and never call an AI provider.

### Billing Advisor Agent
One Claude Managed Agents session per user. Reads real billing/platform
data via custom tools (including a vendor-aware search), can propose (never
directly apply) a status change or deletion, and can hand the user a
one-click deep link into the existing Connect flow — it never sees or
stores a credential itself. Reachable from the web UI and from Slack DMs
(same tools, same org scoping, same credit gate).

### Payments & credits
Stripe Checkout in two modes: one-time (credit top-ups) and recurring
(Pro/Business plan tiers). A verified webhook is the only writer of
`Organization.planTier`/credit grants; `PUT /api/plan` only ever allows a
self-service downgrade to Free. A nightly job reconciles the credit ledger
against each organization's stored balance (detection-only).

## Deployment Targets

| Component | Platform       |
| --------- | -------------- |
| Frontend  | Vercel         |
| Backend   | Render         |
| Database  | MongoDB Atlas  |

---

**For anything beyond this high-level map** — exact module conventions,
field-level schema notes, the full phase-by-phase history, and the current
audit-remediation backlog — see [`../CLAUDE.md`](../CLAUDE.md), the actual
single source of truth this project is maintained against.
