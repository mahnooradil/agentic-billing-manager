/**
 * The user's OWN plan for using this app (not a platform they're billed by).
 * Self-service — there is no payment processor wired up yet, so switching
 * tiers is free and immediate, but the tier and usage counts are real.
 */
export const PLAN_TIERS = ["Free", "Pro", "Business"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanLimits {
  /** `null` = unlimited. */
  maxPlatformConnections: number | null;
  maxBillingRecords: number | null;
}

export interface PlanDefinition {
  tier: PlanTier;
  displayName: string;
  priceMonthly: number;
  currency: string;
  limits: PlanLimits;
  features: string[];
  /** Credit allowance for this plan — composed by the backend from the
   *  separate credits system (config/credits.ts), not part of the plan's
   *  own limits. */
  credits: {
    allowance: number;
    cycleDays: number;
  };
}

export interface PlanUsage {
  platformConnections: number;
  billingRecords: number;
}

export interface PlanData {
  plan: PlanDefinition;
  plans: PlanDefinition[];
  usage: PlanUsage;
}

export interface UpdatePlanPayload {
  tier: PlanTier;
}

export interface UpdatePlanData {
  plan: PlanDefinition;
}
