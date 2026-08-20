/**
 * Credit system constants — the "how much" side of the credit-based usage
 * tracker (services/credits/). No payment processor is wired up yet (see
 * config/plans.ts's own note on that); this is the free-tier token-metering
 * system a future Stripe-backed purchase flow will plug into.
 */

/** Credits a new account starts with. */
export const STARTING_CREDITS = 100;

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
