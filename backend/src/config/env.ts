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
  // Slack — one App (client id/secret), distributed via its own "Add to
  // Slack" OAuth install to EACH customer organization's own workspace (see
  // services/slack/slack-oauth.service.ts). Client id/secret and signing
  // secret are App-level (global, the same for every installing workspace —
  // Slack signs every request with the same secret regardless of which
  // workspace it's from); the BOT TOKEN itself is per-organization, stored
  // encrypted on `Organization.slackWorkspace`, never a single global value.
  // Unset client id/secret/signing secret means the whole Slack integration
  // (install + chat) reports "not configured".
  slackClientId: process.env.SLACK_CLIENT_ID ?? "",
  slackClientSecret: process.env.SLACK_CLIENT_SECRET ?? "",
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET ?? "",
  // Where Slack redirects back after a workspace admin approves the install —
  // must exactly match one of the Redirect URLs configured on the Slack App.
  slackOauthRedirectUri:
    process.env.SLACK_OAUTH_REDIRECT_URI ?? "",
  // Stripe (Buy Credits) — lets a workspace purchase additional Billing
  // Advisor credits via Stripe Checkout (see services/payments/). Unset
  // means the feature reports "not configured" (never faked), same
  // convention as every other optional integration above.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // "Continue with Google" sign-in — verifies the ID token Google Identity
  // Services hands the frontend (see controllers/auth.controller.ts's
  // `googleSignIn`); no client secret is needed for ID-token verification,
  // only the client id (also used, as `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, by the
  // frontend to initialize the button). Unset means the feature reports "not
  // configured", same convention as every other optional integration above.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  // Index integrity (S-01 fix, see config/index-integrity.ts) — when "true",
  // every model's declared indexes are actively synced (built/dropped) at
  // boot. Off by default: meant to be enabled for one deploy after an index
  // changes, then turned off again, not left on permanently. The read-only
  // assertion that fails startup on a missing index always runs regardless
  // of this flag.
  syncIndexesOnBoot: process.env.SYNC_INDEXES_ON_BOOT === "true",
} as const;

export const isProduction = env.nodeEnv === "production";
