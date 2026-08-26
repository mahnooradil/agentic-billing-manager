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
  // Pipedream Connect (F9.2) — managed OAuth for 2,700+ providers. When these
  // are unset, the Pipedream features report "not configured" (never faked).
  pipedreamClientId: process.env.PIPEDREAM_CLIENT_ID ?? "",
  pipedreamClientSecret: process.env.PIPEDREAM_CLIENT_SECRET ?? "",
  pipedreamProjectId: process.env.PIPEDREAM_PROJECT_ID ?? "",
  pipedreamEnvironment: process.env.PIPEDREAM_ENVIRONMENT ?? "development",
  // Claude Managed Agents (Billing Advisor Agent) — powers both the agent chat
  // and (via a throwaway session) the recommendation engine. Agent/environment
  // are pre-created once via the Console; only their IDs live here.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicAgentId: process.env.ANTHROPIC_AGENT_ID ?? "",
  anthropicEnvironmentId: process.env.ANTHROPIC_ENVIRONMENT_ID ?? "",
  // Resend (transactional email) — the only channel this app emails users
  // through (verification codes, support notifications). Requires a verified
  // sending domain in the Resend dashboard; unset means email sending reports
  // "not configured".
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "",
  // Where support requests are emailed (Priority support feature). Falls back
  // to the Resend sending address itself, so no extra config is required.
  supportInboxEmail: process.env.SUPPORT_INBOX_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? "",
  // Slack app credentials — one bot for the whole deployment (not per
  // organization, matching how the Anthropic/Resend keys above are global).
  // Bot token calls the Web API (chat.postMessage); signing secret verifies
  // inbound Events API requests actually came from Slack. Unset means the
  // Slack chat integration reports "not configured".
  slackBotToken: process.env.SLACK_BOT_TOKEN ?? "",
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET ?? "",
} as const;

export const isProduction = env.nodeEnv === "production";
