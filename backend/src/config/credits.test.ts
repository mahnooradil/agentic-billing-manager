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

  /** CLAUDE.md §10.3/§10.4 — these two dimensions were previously ignored
   *  entirely (charged $0 in credits even though they're real Anthropic
   *  costs). The exact point isn't precision down to the cent — it's that a
   *  turn using a lot of cache or a lot of session runtime now costs
   *  strictly MORE credits than the same turn without them, not the same. */
  describe("cache tokens and session runtime are no longer free", () => {
    it("a turn with cache tokens costs more credits than the same turn without them", () => {
      const withoutCache = tokensToCredits(100, 100);
      const withCache = tokensToCredits(100, 100, {
        cacheCreationInputTokens: 5000,
        cacheReadInputTokens: 5000,
      });
      expect(withCache).toBeGreaterThan(withoutCache);
    });

    it("a cache WRITE token costs more than a cache READ token of the same count", () => {
      const writeHeavy = tokensToCredits(0, 0, { cacheCreationInputTokens: 10_000 });
      const readHeavy = tokensToCredits(0, 0, { cacheReadInputTokens: 10_000 });
      expect(writeHeavy).toBeGreaterThan(readHeavy);
    });

    it("a long-running session costs more credits than a short one with identical tokens", () => {
      const shortSession = tokensToCredits(100, 100, { sessionSeconds: 2 });
      const longSession = tokensToCredits(100, 100, { sessionSeconds: 3600 }); // 1 hour
      expect(longSession).toBeGreaterThan(shortSession);
    });

    it("a full hour of session runtime alone (at $0.08/hr, $0.02/credit) costs about 4 credits", () => {
      // $0.08 / $0.02 = 4 credits for the session-hour dimension alone,
      // plus whatever the (here, zero) token dimension adds.
      expect(tokensToCredits(0, 0, { sessionSeconds: 3600 })).toBe(4);
    });

    it("omitting the third argument entirely behaves exactly as before (backward compatible)", () => {
      expect(tokensToCredits(1001, 0)).toBe(tokensToCredits(1001, 0, undefined));
      expect(tokensToCredits(1001, 0)).toBe(tokensToCredits(1001, 0, {}));
    });
  });
});
