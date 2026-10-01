/**
 * Symmetric encryption for secrets at rest (platform API keys, Slack bot
 * tokens — see every `encryptSecret`/`decryptSecret` call site).
 *
 * WP-7 hardening (CLAUDE.md Sec10.3, flow/02 item 22) — three fixes over the
 * original version:
 *   1. `AI_ENCRYPTION_KEY` is now REQUIRED, not optional. It used to fall
 *      back to `JWT_SECRET` when unset, meaning two unrelated concerns
 *      (signing sessions vs. encrypting stored credentials) silently shared
 *      one secret. `assertEncryptionKeyConfigured()` fails startup instead
 *      (see server.ts) — the same "fail loudly at boot, not quietly at first
 *      use" pattern `assertNoLiveStripeKeyOutsideProduction()` already uses.
 *   2. A real KDF (HKDF, RFC 5869) with a random salt PER ENCRYPTION replaces
 *      a bare, unsalted single SHA-256 pass. `AI_ENCRYPTION_KEY` is expected
 *      to already be a long, random, high-entropy value (like `JWT_SECRET`),
 *      not a human-chosen password — HKDF is the correct primitive for
 *      "stretch an already-high-entropy secret into a derived key" (unlike
 *      scrypt/bcrypt/argon2, which exist specifically to slow down brute-
 *      forcing a LOW-entropy human password, not needed here and would add
 *      real latency to every encrypt/decrypt call for no benefit).
 *   3. The stored payload is now VERSIONED (`v2.` prefix) and carries its own
 *      salt — a future key rotation can introduce `v3` and decrypt old `v2`
 *      payloads with the old key during a transition, rather than needing a
 *      flag-day re-encryption migration. No `v1` payloads exist anywhere in
 *      the live database (confirmed via a live count before this change —
 *      `PlatformConnection.credential` and `Organization.slackWorkspace.
 *      botToken` were both at 0), so this is a clean format cutover, not a
 *      migration — `v1`'s old unsalted-SHA-256 format is not supported here
 *      at all, deliberately, rather than carrying forward a weaker scheme
 *      "just in case."
 *
 * Never log or return the plaintext.
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { env } from "@/config/env";
import { AppError } from "@/utils/appError";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
/** Domain-separates this derived key from any other HKDF use of the same
 *  secret, should one ever exist — standard HKDF practice, not secret itself. */
const HKDF_INFO = "agentic-billing-manager:secret-encryption:v2";
const PAYLOAD_VERSION = "v2";

/** Throws if `AI_ENCRYPTION_KEY` isn't set. Called once at server startup
 *  (see server.ts) so a misconfigured deploy fails loudly before it ever
 *  accepts a request that would need to encrypt/decrypt a stored secret —
 *  not silently the first time a user tries to connect a platform. */
export function assertEncryptionKeyConfigured(): void {
  if (!env.aiEncryptionKey) {
    throw new Error(
      "AI_ENCRYPTION_KEY is not set. This is required — stored secrets " +
        "(platform credentials, Slack bot tokens) must never fall back to " +
        "JWT_SECRET. Generate one with: openssl rand -base64 32"
    );
  }
}

/** Derives a 32-byte AES key from the configured secret + a per-payload salt. */
function deriveKey(salt: Buffer): Buffer {
  if (!env.aiEncryptionKey) {
    throw new AppError("Encryption secret is not configured", 500);
  }
  return Buffer.from(
    hkdfSync("sha256", env.aiEncryptionKey, salt, HKDF_INFO, KEY_LENGTH)
  );
}

/** Encrypts plaintext → "v2.salt.iv.tag.ciphertext" (all base64 after the
 *  version tag). A fresh random salt AND iv are generated every call, so
 *  encrypting the same plaintext twice never produces the same payload. */
export function encryptSecret(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(salt), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PAYLOAD_VERSION,
    salt.toString("base64"),
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

/** Decrypts a payload produced by `encryptSecret` back to plaintext. */
export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 5 || parts[0] !== PAYLOAD_VERSION) {
    throw new AppError("Malformed or unsupported encrypted secret", 500);
  }
  const [, saltB64, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(Buffer.from(saltB64, "base64")),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
