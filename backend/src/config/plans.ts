/**
 * Plan catalog — static, in-code (like `platform-catalog.ts` on the frontend).
 * No payment processor is wired up yet: switching plans here is self-service
 * and free, tracked honestly (a real stored tier + real usage counts), rather
 * than faking a checkout flow that doesn't exist. Wiring a real payment
 * processor (Stripe et al.) to actually collect money is a separate, later
 * phase — this is the data model + limits it will plug into.
 *
 * Deliberately does NOT include the AI credits allowance — credits are a
 * separate system (see config/credits.ts) that tracks real AI usage cost,
 * independent of which plan tier gates platform/billing-record limits.
 */
export const PLAN_TIERS = ["Free", "Pro", "Business"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanLimits {
  /** Max connected platforms. `null` = unlimited. */
  maxPlatformConnections: number | null;
  /** Max billing records. `null` = unlimited. */
  maxBillingRecords: number | null;
}

export interface PlanDefinition {
  tier: PlanTier;
  displayName: string;
  priceMonthly: number;
  currency: string;
  limits: PlanLimits;
  features: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  Free: {
    tier: "Free",
    displayName: "Free",
    priceMonthly: 0,
    currency: "USD",
    limits: { maxPlatformConnections: 3, maxBillingRecords: 25 },
    features: [
      "Up to 3 connected platforms",
      "Up to 25 billing records",
      "Billing Advisor Agent",
      "Automatic recommendations",
    ],
  },
  Pro: {
    tier: "Pro",
    displayName: "Pro",
    priceMonthly: 15,
    currency: "USD",
    limits: { maxPlatformConnections: 25, maxBillingRecords: 1000 },
    features: [
      "Up to 25 connected platforms",
      "Up to 1,000 billing records",
      "Billing Advisor Agent",
      "Automatic recommendations",
      "Priority support",
    ],
  },
  Business: {
    tier: "Business",
    displayName: "Business",
    priceMonthly: 49,
    currency: "USD",
    limits: { maxPlatformConnections: null, maxBillingRecords: null },
    features: [
      "Unlimited connected platforms",
      "Unlimited billing records",
      "Billing Advisor Agent",
      "Automatic recommendations",
      "Priority support",
    ],
  },
};

export function getPlan(tier: PlanTier): PlanDefinition {
  return PLANS[tier];
}
