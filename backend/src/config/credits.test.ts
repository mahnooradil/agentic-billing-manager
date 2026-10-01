import { describe, expect, it } from "vitest";

import {
  CREDIT_ALLOWANCE_BY_PLAN,
  CREDIT_CYCLE_DAYS_BY_PLAN,
  CREDIT_USD_VALUE,
  tokensToCredits,
} from "@/config/credits";

/**
 * Standing guard for the audit's CR-012 finding (docs/audit/03 §6,
 * CLAUDE.md §10.3/§10.4): Pro/Business used to renew their AI allowance
 * once per 365-day cycle while billed monthly, leaving a customer who
 * exhausted it stuck for up to 11.5 months. Every plan must reset on the
 * same 30-day cadence it's actually billed on, and the worst-case monthly
 * cost of a plan's full allowance must never exceed its own monthly price
 * (a margin regression this fix must not silently introduce).
 */
describe("credit cycle (CR-012 — every plan resets monthly now)", () => {
  it("every plan's cycle is 30 days, not an annual 365-day cycle", () => {
    for (const days of Object.values(CREDIT_CYCLE_DAYS_BY_PLAN)) {
      expect(days).toBe(30);
    }
  });

  it("a plan's worst-case monthly credit cost never exceeds its own monthly price", () => {
    const monthlyPriceUsd: Record<string, number> = { Free: 0, Pro: 15, Business: 49 };
    for (const [tier, allowance] of Object.entries(CREDIT_ALLOWANCE_BY_PLAN)) {
      const worstCaseCostUsd = allowance * CREDIT_USD_VALUE;
      expect(worstCaseCostUsd).toBeLessThanOrEqual(monthlyPriceUsd[tier] || Infinity);
    }
  });
});

describe("tokensToCredits", () => {
  it("rounds up to the nearest whole credit, minimum 1", () => {
    expect(tokensToCredits(0, 0)).toBe(1);
    expect(tokensToCredits(500, 0)).toBe(1);
    expect(tokensToCredits(1000, 0)).toBe(1);
    expect(tokensToCredits(1001, 0)).toBe(2);
    expect(tokensToCredits(600, 600)).toBe(2);
  });
});
