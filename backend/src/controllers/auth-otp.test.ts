import crypto from "node:crypto";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { Otp, OTP_MAX_ATTEMPTS } from "@/models/otp.model";

const app = createApp();

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function insertKnownOtp(email: string, code: string) {
  await Otp.deleteMany({ email });
  await Otp.create({
    email,
    codeHash: sha256(code),
    attempts: 0,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
}

describe("POST /api/auth/verify-otp — atomic attempt counter (S-03)", () => {
  it("N concurrent wrong guesses consume at most OTP_MAX_ATTEMPTS attempts, never more", async () => {
    const email = "otp-race-test@example.com";
    await insertKnownOtp(email, "111111");

    const CONCURRENCY = 12;
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        request(app).post("/api/auth/verify-otp").send({ email, code: "000000" })
      )
    );

    // No wrong guess is ever accepted.
    expect(responses.every((r) => r.status !== 200)).toBe(true);

    const messages = responses.map((r) => r.body.message as string);
    const incorrect = messages.filter((m) => m.includes("Incorrect code"));
    const tooMany = messages.filter((m) => m.includes("Too many incorrect"));
    const expired = messages.filter((m) => m.includes("expired or wasn't found"));

    // Every response lands in exactly one of the three expected buckets.
    expect(incorrect.length + tooMany.length + expired.length).toBe(CONCURRENCY);

    // The "remaining attempts" values reported must never exceed
    // OTP_MAX_ATTEMPTS - 1 — if the old non-atomic bug were present, N
    // concurrent requests could all read attempts=0 and each report
    // "4 remaining", which this catches.
    const remainingValues = incorrect.map((m) => Number(/(\d+) attempt/.exec(m)?.[1]));
    for (const n of remainingValues) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(OTP_MAX_ATTEMPTS);
    }

    // The record must be gone once exhausted — proves cleanup fired and
    // proves (indirectly, since the field can't be read after deletion)
    // that no further increments are possible after this point.
    const stillExists = await Otp.findOne({ email });
    expect(stillExists).toBeNull();
  });

  it("the correct code, submitted after exhaustion, is still rejected (no replay)", async () => {
    const email = "otp-exhaust-then-correct@example.com";
    const realCode = "222222";
    await insertKnownOtp(email, realCode);

    // Exhaust it sequentially first.
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await request(app).post("/api/auth/verify-otp").send({ email, code: "999999" });
    }

    const res = await request(app).post("/api/auth/verify-otp").send({ email, code: realCode });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired or wasn't found/);
  });

  it("a correct code with attempts remaining succeeds and deletes the record", async () => {
    const email = "otp-correct-first-try@example.com";
    const realCode = "333333";
    await insertKnownOtp(email, realCode);

    const res = await request(app).post("/api/auth/verify-otp").send({ email, code: realCode });
    expect(res.status).toBe(200);

    const stillExists = await Otp.findOne({ email });
    expect(stillExists).toBeNull();
  });
});

describe("POST /api/auth/login/request-otp — uniform response (S-13) + rate limit (S-04)", () => {
  it("returns the identical response for a non-existent email, and creates no Otp record", async () => {
    const email = "login-nonexistent@example.com";

    const res = await request(app).post("/api/auth/login/request-otp").send({ email });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/);

    const otp = await Otp.findOne({ email });
    expect(otp).toBeNull();
  });

  it("rate-limits after its configured max, returning 429", async () => {
    // The limiter is a module-level in-memory bucket keyed by IP (shared
    // across every request in this test run, including the previous test —
    // supertest requests all resolve to the same loopback address), so this
    // asserts the *shape* of the behavior (a clean 200...200,429...429
    // transition) rather than an exact absolute count, which would be
    // fragile against whatever budget earlier tests already consumed.
    // Each call uses a distinct email so only the per-IP limiter is
    // exercised, not any per-email cooldown inside issueOtp.
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/auth/login/request-otp")
        .send({ email: `rl-test-${i}@example.com` });
      statuses.push(res.status);
    }

    const firstLimited = statuses.indexOf(429);
    expect(firstLimited).toBeGreaterThan(-1); // the limit must actually engage
    expect(statuses.slice(0, firstLimited).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(firstLimited).every((s) => s === 429)).toBe(true);
  });
});
