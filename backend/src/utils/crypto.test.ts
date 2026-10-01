import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "@/config/env";
import { AppError } from "@/utils/appError";
import {
  assertEncryptionKeyConfigured,
  decryptSecret,
  encryptSecret,
} from "@/utils/crypto";

/**
 * WP-7 hardening (CLAUDE.md Sec10.3, flow/02 item 22) — three things to
 * prove: the key is now required (no silent JWT_SECRET fallback), the
 * payload is salted per-call (not a bare deterministic hash), and the
 * payload is versioned so a future rotation has somewhere to branch.
 */
describe("crypto — secret encryption (WP-7)", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const plaintext = "sk_live_super_secret_platform_api_key";
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("the stored payload is versioned (v2) and salted (differs every call)", () => {
    const a = encryptSecret("same-plaintext");
    const b = encryptSecret("same-plaintext");
    expect(a.startsWith("v2.")).toBe(true);
    expect(b.startsWith("v2.")).toBe(true);
    // Different salt + iv every call — two encryptions of the same plaintext
    // must never look the same (the old bare-SHA-256, no-salt scheme this
    // replaces had no such guarantee for a reused iv).
    expect(a).not.toBe(b);
    // 5 dot-separated parts: version, salt, iv, tag, ciphertext.
    expect(a.split(".")).toHaveLength(5);
  });

  it("rejects a tampered ciphertext (GCM auth tag catches it)", () => {
    const encrypted = encryptSecret("do-not-tamper-with-this-longer-secret-value");
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[4]!, "base64");
    // Flip a bit in the middle byte — guaranteed to change the decoded
    // plaintext (unlike a trailing base64 character, whose padding bits can
    // sometimes leave the decoded bytes unchanged).
    ciphertext[Math.floor(ciphertext.length / 2)] ^= 0xff;
    const tamperedPayload = [...parts.slice(0, 4), ciphertext.toString("base64")].join(".");
    expect(() => decryptSecret(tamperedPayload)).toThrow();
  });

  it("rejects a malformed payload (wrong shape) with a clear AppError, not a crash", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow(AppError);
    expect(() => decryptSecret("v2.only.three.parts")).toThrow(AppError);
  });

  it("rejects an unversioned (old v1-style) payload instead of silently accepting it", () => {
    // The pre-hardening format was "iv.tag.ciphertext" — 3 parts, no version
    // tag. Confirms the cutover is a hard break, not a quiet fallback.
    expect(() => decryptSecret("aXY=.dGFn.ZGF0YQ==")).toThrow(AppError);
  });

  describe("assertEncryptionKeyConfigured", () => {
    let original: string;
    beforeAll(() => {
      original = env.aiEncryptionKey;
    });
    afterAll(() => {
      (env as { aiEncryptionKey: string }).aiEncryptionKey = original;
    });

    it("throws when AI_ENCRYPTION_KEY is unset", () => {
      (env as { aiEncryptionKey: string }).aiEncryptionKey = "";
      expect(() => assertEncryptionKeyConfigured()).toThrow(/AI_ENCRYPTION_KEY/);
    });

    it("does not throw once it's set", () => {
      (env as { aiEncryptionKey: string }).aiEncryptionKey = "a-real-looking-secret";
      expect(() => assertEncryptionKeyConfigured()).not.toThrow();
    });
  });
});
