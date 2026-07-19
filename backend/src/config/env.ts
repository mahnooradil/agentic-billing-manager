/**
 * Centralized, typed access to environment variables.
 * Loaded once at startup so the rest of the app never touches `process.env`.
 */
import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  // Comma-separated list of allowed origins for CORS (e.g. the frontend URL).
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  // MongoDB Atlas connection string. Presence is validated at connect time
  // (see config/database.ts) so startup can fail gracefully with a clear error.
  mongoUri: process.env.MONGODB_URI ?? "",
  // JWT signing secret. Presence is validated when a token is first issued
  // (see utils/jwt.ts) so a misconfigured deploy fails with a clear message.
  jwtSecret: process.env.JWT_SECRET ?? "",
  // Token lifetime, e.g. "1d", "12h", "3600". Falls back to a safe default.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  // Secret used to encrypt stored third-party API keys (AES-256-GCM). Optional:
  // falls back to a key derived from JWT_SECRET. Presence validated on first use
  // (see utils/crypto.ts) so a misconfigured deploy fails with a clear message.
  aiEncryptionKey: process.env.AI_ENCRYPTION_KEY ?? "",
} as const;

export const isProduction = env.nodeEnv === "production";
