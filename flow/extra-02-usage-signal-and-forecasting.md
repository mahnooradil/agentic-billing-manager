# Flow — Extra Item: Usage Signal, "What to Cancel," and Forecasting

**Not from the 12 audit documents** — the audit explicitly identifies this gap (no usage signal exists
anywhere in the system) but does not design a solution, since it's out of the original brief's core
scope. Raised by the user on 2026-09-25 after reviewing which of the product vision's example
questions our planned work would and wouldn't actually answer. Recorded here as its own tracked item,
same pattern as `flow/extra-01-slack-oauth-redesign.md`.

**Priority: explicitly scheduled for the END of the overall roadmap** — the user's own instruction.
Everything in the 12-document work (production safety, domain model/provenance, agent router, Stripe)
comes first. Do not pull this forward without the user saying so.

---

## The four questions this unblocks

"Which subscriptions should we cancel?" · "Which subscriptions aren't being used enough?" ·
"Forecast next month's software spending" · "Where are we wasting money?" — confirmed during the
document-08 review that none of these are answerable even after every currently-planned fix, because
two different capabilities are missing and neither was ever in scope: a usage/utility signal, and a
forecasting calculation.

---

## Part A — Usage signal (unblocks the cancel/underused questions)

Three approaches, cheapest and most honest first:

**A1 — Periodic user self-report (build this first).** Every 60–90 days, ask the user a simple
question per active vendor/subscription: *"How often do you use {vendor}? Daily / Occasionally /
Rarely or never."* Store the answer on the `Vendor` model (a new `utilityRating` field +
`utilityRatedAt` timestamp — small schema addition, no new collection needed). This is not AI, not
invasive, and cheap to build — a scheduled in-app prompt or notification, one field write. It directly
answers "underused" for any vendor the user has actually rated.

**A2 — Real usage data from platforms whose API exposes it (selective, not all 129 adapters).** Some
already-connected platforms genuinely expose seat/activity data through their own API — e.g. Slack
(active member count), Google Workspace (admin usage reports), GitHub (active seats). Extend only
those specific adapters (a small subset of the 129, not a blanket change) to also pull a usage metric
into a new lightweight signal (could live alongside `UsageAccrual`, or a new minimal `UsageSignal`
collection — decide when this is actually scoped). Do this only for platforms where the data is
genuinely available via an existing, already-connected API — never build a new integration just for
this.

**A3 — Rejected for now, with reason.** Browser/device-level usage tracking of third-party tools —
too invasive for this product's trust model, out of scope indefinitely unless the product direction
changes.

---

## Part B — Forecasting (unblocks "forecast next month")

**Important framing correction, worth keeping:** this does **not** require machine learning, a
forecasting model, or any new AI capability. `ARCHITECTURE.md`'s old "Forecast Engine" claim was
always aspirational and was never built — but the actual need here is satisfied by **plain
deterministic arithmetic once the domain-model fixes land**, consistent with the same "let code do
math, not AI" principle already applied everywhere else in this plan:

- Recurring subscriptions: known cadence (from `Vendor.billingCadence`, part of the already-planned
  domain model) × known amount = a naive but useful next-month projection.
- Non-recurring/variable spend: a simple trailing average (e.g. mean of the last 3 months) per vendor
  or per category.

Zero AI credits, zero new infrastructure — just a query + a formula, the same shape as every other
deterministic router-handled question already planned. **Explicitly depends on the domain-model
rebuild (`Vendor.billingCadence`, clean per-vendor monthly totals) landing first** — attempting this
before that work would just forecast garbage data forward.

---

## Part C — "Where are we wasting money" (combination, no new mechanism)

Once A (usage signal) and the existing anomaly/price-increase detection (already planned via
`BillingEvent`'s `amount_changed` tracking) both exist, "waste" becomes a simple rule, not a new
capability: **high relative cost + low reported/observed usage = flagged as a savings opportunity**,
surfaced through the existing recommendation engine with the already-planned required
`estimatedMonthlyImpact` dollar figure. No new engineering beyond combining two things already on the
roadmap.

---

## Suggested order (only relevant once this item is actually picked up — at the end)

1. `Vendor.utilityRating` field + a periodic in-app prompt (A1) — smallest, no dependencies beyond
   the `Vendor` model already existing from the domain-model rebuild.
2. Simple recurring-spend forecast formula (Part B) — depends on the domain-model rebuild + clean
   vendor billing-cadence data.
3. Selective per-adapter usage-data extension (A2) — pick specific platforms only when there's a
   concrete reason to (e.g. a customer asks, or Slack/Google Workspace connections are common enough
   to justify it).
4. "Where are we wasting" recommendation rule (Part C) — depends on 1 and the existing
   `amount_changed`/anomaly detection.

**Not yet approved for implementation. Explicitly deferred to the end of the overall roadmap per the
user's own instruction (2026-09-25).**
