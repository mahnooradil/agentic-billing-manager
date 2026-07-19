/**
 * Symmetric encryption for secrets at rest (e.g. third-party API keys).
 *
 * Uses AES-256-GCM with a 32-byte key derived from a configured secret. The
 * output packs the IV, auth tag, and ciphertext so a single string can be
 * stored and later decrypted. Never log or return the plaintext.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { env } from "@/config/env";
import { AppError } from "@/utils/appError";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/** Derives a stable 32-byte key from the configured encryption secret. */
function getKey(): Buffer {
  const secret = env.aiEncryptionKey || env.jwtSecret;
  if (!secret) {
    throw new AppError("Encryption secret is not configured", 500);
  }
  return createHash("sha256").update(secret).digest();
}

/** Encrypts plaintext → "iv.tag.ciphertext" (all base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

/** Decrypts a payload produced by `encryptSecret` back to plaintext. */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new AppError("Malformed encrypted secret", 500);
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
