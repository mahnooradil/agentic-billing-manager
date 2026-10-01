/**
 * Credit system constants — the "how much" side of the credit-based usage
 * tracker (services/credits/). Deliberately a SEPARATE system from
 * config/plans.ts: plan tier gates platform/billing-record limits, credits
 * meter real AI usage cost. `PlanTier` is imported only as a lookup KEY for
 * this module's own mapping below — config/plans.ts itself carries no
 * credits field and knows nothing about this file, so the two systems can
 * change independently. No payment processor is wired up yet; this is the
 * free-tier token-metering system a future Stripe-backed purchase flow will
 * plug into (the ledger already supports a "purchase" grant type — see
 * services/credits/credit-ledger.service.ts's `grantCredits` — for exactly
 * that, once real "Buy more credits" checkout exists).
 */
import type { PlanTier } from "@/config/plans";

/** Credits a new account starts with (same as the Free plan's own
 *  allowance below, since every new org starts on Free). */
export const STARTING_CREDITS = 100;

/**
 * Credits an account is reset to at the START of each plan-cycle (see
 * services/credits/credit-reset-scheduler.ts) — sized so that even if a
 * plan's ENTIRE allowance is used in one cycle, the real Anthropic cost
 * stays safely below what that cycle's subscription revenue covers:
 *
 *   Free:     100 credits/mo → worst case $2/mo  — plan price $0/mo  (bounded acquisition cost)
 *   Pro:      333 credits/mo → worst case $6.7/mo — plan price $15/mo — ~55% margin even at full use
 *   Business: 1000 credits/mo → worst case $20/mo — plan price $49/mo — ~59% margin even at full use
 *
 * Typical real usage (see the usage estimate this was derived from) is far
 * below these numbers — a normal user never gets near the ceiling; it only
 * bites someone who is genuinely using the AI features far beyond typical
 * patterns.
 *
 * Every plan now resets MONTHLY (see `CREDIT_CYCLE_DAYS_BY_PLAN`) — Pro and
 * Business used to get one lump allowance for a full 365-day cycle (4000 /
 * 12000 credits respectively). The audit (CLAUDE.md §10.3/§10.4,
 * docs/audit/03-COST-AND-UNIT-ECONOMICS.md §6, CR-012) flagged this as a
 * real bug: a paid subscription bills monthly, but its AI allowance only
 * renewed once a year, so a customer who exhausted their credits early
 * (e.g. the email-sync re-extraction bug, since fixed — see
 * services/email-sync's ProcessedMessage dedup) was left with a dead
 * product for up to 11.5 months with no way to buy more credits at the
 * time. The fix here is NOT "give them the same 4000/12000 every month" —
 * that would blow the margin math above 12×. It's the exact same annual
 * total, divided into 12 monthly installments, so a customer regains a
 * fair-use ceiling every 30 days instead of once a year, at the identical
 * overall cost ratio already decided above.
 *
 * Once exhausted mid-cycle, the account simply waits for the next cycle
 * reset (now at most 30 days away for every tier, not 365), or buys more
 * credits separately via the "Buy more credits" Stripe checkout flow
 * (config/credit-packages.ts) — there is no automatic top-up.
 */
export const CREDIT_ALLOWANCE_BY_PLAN: Record<PlanTier, number> = {
  Free: 100,
  Pro: 333,
  Business: 1000,
};

/** How many days one credit cycle lasts, per plan. Every plan resets
 *  monthly — matches each plan's own Stripe billing cycle (subscriptions
 *  renew monthly, see services/payments/stripe-subscription.service.ts), so
 *  a customer's AI allowance refreshes on the same cadence they're actually
 *  paying on, not once a year. See `CREDIT_ALLOWANCE_BY_PLAN`'s docstring
 *  above for why Pro/Business's per-cycle numbers were resized, not just
 *  the cycle length. */
export const CREDIT_CYCLE_DAYS_BY_PLAN: Record<PlanTier, number> = {
  Free: 30,
  Pro: 30,
  Business: 30,
};

/** Real-money value backing one credit, set above the actual per-call
 *  Anthropic cost so `CREDIT_ALLOWANCE_BY_PLAN` stays a safe fair-use
 *  ceiling rather than a break-even line (see the math above). Not yet
 *  charged to users directly (no payment processor wired up) —
 *  informational until a real credit-purchase flow needs it. */
export const CREDIT_USD_VALUE = 0.02;

// Placeholder blended rate — 1 credit per 1,000 total tokens (input + output
// combined), rounded up, minimum 1 credit per message. This intentionally
// does not yet weight input vs output tokens differently (Anthropic prices
// them at different rates) — tune this once a real credits-per-dollar rate
// is set for the purchase flow. Exported (not private) so the `/credits`
// endpoint can surface the real rate to the UI instead of a hardcoded copy.
export const TOKENS_PER_CREDIT = 1000;

/** Converts one turn's token usage into a whole number of credits (min 1). */
export function tokensToCredits(inputTokens: number, outputTokens: number): number {
  const total = Math.max(0, inputTokens) + Math.max(0, outputTokens);
  return Math.max(1, Math.ceil(total / TOKENS_PER_CREDIT));
}
