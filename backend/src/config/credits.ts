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
 *   Free:     100 credits  → worst case $2/mo   — plan price $0    (bounded acquisition cost)
 *   Pro:     4000 credits  → worst case $80/yr  — plan price $180/yr (12 × $15) — ~56% margin even at full use
 *   Business: 12000 credits → worst case $240/yr — plan price $588/yr (12 × $49) — ~59% margin even at full use
 *
 * Typical real usage (see the usage estimate this was derived from) is far
 * below these numbers — a normal user never gets near the ceiling; it only
 * bites someone who is genuinely using the AI features far beyond typical
 * patterns. Free resets on a short (monthly) cycle since it's a running
 * cost with no revenue behind it; Pro/Business get one allowance for the
 * WHOLE cycle length below (no monthly top-up) — see
 * `CREDIT_CYCLE_DAYS_BY_PLAN`. Once exhausted mid-cycle, the account simply
 * waits for the next cycle reset, or buys more credits separately (once
 * that purchase flow exists) — there is no automatic top-up.
 */
export const CREDIT_ALLOWANCE_BY_PLAN: Record<PlanTier, number> = {
  Free: 100,
  Pro: 4000,
  Business: 12000,
};

/** How many days one credit cycle lasts, per plan. Free resets often (it's
 *  an ongoing cost with no revenue behind it); paid plans get one allowance
 *  for the whole year, matching the "your subscription is locked in and
 *  doesn't expire mid-cycle" framing used for the plan itself. */
export const CREDIT_CYCLE_DAYS_BY_PLAN: Record<PlanTier, number> = {
  Free: 30,
  Pro: 365,
  Business: 365,
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
