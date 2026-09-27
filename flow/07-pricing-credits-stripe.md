# Flow for Document 07 — Pricing, Credits and Stripe

**Read:** in full, line by line. **Inspected against live code:** yes, on 2026-09-25 — including a
precise comparison of this document's exact Stripe spec against the uncommitted Stripe work already
found during document 00's inspection. **Per the user's explicit instruction, none of the Stripe
findings below are being acted on now** — this file exists purely so the full picture is on record
for when they give instruction. Nothing here has been implemented or changed.

---

## Cross-reference — already tracked, not repeated

| This doc's finding | Already tracked in |
|---|---|
| §3 free self-upgrade to Business, no payment gate | `flow/00-executive-summary.md` #4 |
| §1 stale-cache balance check, fire-and-forget debit, unmetered dimensions, no iteration cap (C1–C4) | `flow/01-current-architecture.md`, `flow/02-code-and-module-audit.md` |
| §1 annual credit cycle (C5) | `flow/00-executive-summary.md` #4 |
| §1 ledger design itself (atomic `$inc`, immutable `CreditTransaction`) confirmed well-built | Already noted as good design since document 01/02's inspection |

---

## The most important finding in this document's flow — precise gap analysis of the existing uncommitted Stripe work

Document 00's inspection found a real, uncommitted "buy credit top-ups" Stripe implementation already
in the working tree. Read against this document's **exact** spec (§5, §6), here is precisely what's
already built and what isn't — this is the single most useful thing to have on record before any
Stripe instruction is given.

### Already built, matches this document's §6 (credit top-up) closely

- `stripe-checkout.service.ts`: Customer create/reuse with `metadata.organizationId` ✓, Checkout
  Session in `mode:"payment"` for fixed credit packs ✓ (matches §6's recommended shape exactly)
- `stripe-webhook.controller.ts`: raw body, signature verification, **confirmed mounted in `app.ts`
  before the global JSON parser** — matches invariant #1 exactly, and explicitly reuses the same
  pattern as the Slack webhook (confirmed by the file's own comment)
- `StripeProcessedEvent` (named differently from this doc's `StripeEvent`, same function): unique
  index on `eventId`, **created before processing, confirmed** — matches invariant #2 exactly, the
  single control that prevents double credit grants
- `organizationId` in Checkout Session metadata — matches invariant #3
- `grantCredits(org, credits, "credit_purchase", "purchase")` reuses the existing ledger's
  `purchase` transaction type — matches §6's "the ledger already supports this" note exactly
- Webhook handler: **confirmed to ACK immediately (`res.status(200).send()`) before processing**,
  matching the "ack fast, process after" pattern this document's own diagram implies

### Confirmed NOT built — this document's §5 (full subscription / plan-tier Stripe) is a separate, larger scope

Read `stripe-webhook.controller.ts` in full: it handles **only** `event.type ===
"checkout.session.completed"`. Confirmed via search:
- **No `Subscription` model exists anywhere** in `backend/src/models/`.
- **No `customer.subscription.created/updated/deleted` handling** — none of §5's "Events to handle"
  table beyond the single checkout-completion event exists.
- **No `invoice.paid`/`invoice.payment_failed` handling** — no renewal or dunning logic.
- **No out-of-order tolerance** (`event.created` vs a stored `lastEventAt`) — makes sense, since
  there's no subscription lifecycle being tracked yet, only one-time payments.
- **No live-key-in-non-production startup assertion** — searched, no match.
- **No nightly reconciliation job** (`sum(CreditTransaction.amount) === creditsBalance`) — searched
  for "reconcil" across the whole backend, no match anywhere.
- **`plan.controller.ts`'s `updateMyPlan` is still completely unconnected to any of this** — it still
  does a bare `organization.planTier = tier` with no Stripe involvement at all (confirmed in document
  00's inspection). The existing Stripe work and the plan-tier gate are two entirely separate,
  currently-disconnected pieces.

### Summary, precisely stated

**What exists today is a working, well-built implementation of exactly §6 (credit top-up purchases)
and none of §5 (subscription checkout / plan-tier payment gating).** These are the same document's
two distinct recommendations, and only one of the two has any code behind it. Whoever resumes this
work should treat §5 as the remaining, larger, separate task — not as "finishing" what's already
there, since the existing code doesn't touch subscriptions at all.

---

## Other findings — not yet built, no code exists

- **§2's credit-redefinition** (customer-visible units — "1 invoice extracted = 1 credit," "1 AI
  question = 5 credits," deterministic queries = 0) — confirmed **not implemented**:
  `config/credits.ts` still defines `TOKENS_PER_CREDIT = 1000` and `CREDIT_USD_VALUE = 0.02`, the
  same token-blended model this document recommends replacing. This is a larger, product-level
  change (touches every place credits are charged) — net-new work, not a small fix.
- **§3's recommended plan structure** (Free/Starter $29/Growth $99/Business $299 with inbox-based
  limits) — not implemented; the current plan tiers are still the old Free/Pro $15/Business $49
  structure already confirmed present via `config/plans.ts` in earlier inspection.

---

## Updated combined suggested order

This document's items are **explicitly excluded from the near-term order** per the user's own
instruction — "Stripe wala kaam mujhe yaad hai, adha ho chuka tha, wo bataun kya karna" (they will
give separate instruction on the Stripe work specifically). No items from this document are added to
the running suggested-order list. When that instruction comes, the two pieces to sequence will be:

- Resume/finish/commit the existing credit-top-up work (§6 scope — already ~90% done per the gap
  analysis above)
- Separately, decide whether to build the full §5 subscription/plan-tier Stripe architecture (a much
  larger, higher-risk, "real money" piece — the audit's own roadmap marks this as high-risk and
  recommends it run on a second engineer in parallel with the domain-model work, not serialized
  behind everything else)

**Not yet approved for implementation of any kind — awaiting the user's specific Stripe instruction.**
