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
  // Shared secret for inbound Pipedream webhooks (sent as `X-Webhook-Token`).
  // If unset, the webhook fails closed and rejects all requests.
  pipedreamWebhookSecret: process.env.PIPEDREAM_WEBHOOK_SECRET ?? "",
  // Pipedream Connect (F9.2) — managed OAuth for 2,700+ providers. When these
  // are unset, the Pipedream features report "not configured" (never faked).
  pipedreamClientId: process.env.PIPEDREAM_CLIENT_ID ?? "",
  pipedreamClientSecret: process.env.PIPEDREAM_CLIENT_SECRET ?? "",
  pipedreamProjectId: process.env.PIPEDREAM_PROJECT_ID ?? "",
  pipedreamEnvironment: process.env.PIPEDREAM_ENVIRONMENT ?? "development",
  // Claude Managed Agents (Billing Advisor Agent) — our own Anthropic account,
  // separate from each user's personal AiSettings provider key. Agent/environment
  // are pre-created once via the Console; only their IDs live here.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicAgentId: process.env.ANTHROPIC_AGENT_ID ?? "",
  anthropicEnvironmentId: process.env.ANTHROPIC_ENVIRONMENT_ID ?? "",
} as const;

export const isProduction = env.nodeEnv === "production";
