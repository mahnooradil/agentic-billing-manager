import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { env, isProduction } from "@/config/env";
import routes from "@/routes";
import { slackEvents, slackOAuthCallback } from "@/controllers/slack.controller";
import { stripeWebhook } from "@/controllers/stripe-webhook.controller";
import { notFound } from "@/middlewares/notFound";
import { errorHandler } from "@/middlewares/errorHandler";

/**
 * Builds and configures the Express application.
 * Kept separate from the server bootstrap (server.ts) for testability.
 */
export function createApp(): Application {
  const app = express();

  // Trust the first hop (the hosting platform's own proxy, e.g. Railway) so
  // `req.ip` resolves to the real client instead of the proxy itself. Without
  // this, every unauthenticated request — including every OTP rate-limit
  // check, which keys by IP — collapses into one shared bucket (S-15).
  app.set("trust proxy", 1);

  // Security & infrastructure middleware
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  // Gzips every JSON response — only touches the OUTGOING body, so it's safe
  // ahead of the raw-body webhook routes below (those only care about the
  // exact bytes of the INCOMING request, which this never modifies). Cuts
  // response transfer size, which matters most for a user on a slow/mobile
  // connection as list responses (billing, notifications) grow over time.
  app.use(compression());

  // Slack signs requests over the exact raw body bytes — must be captured
  // BEFORE the global JSON parser below consumes the stream, so this one
  // route gets its own `express.raw()` ahead of everything else. See
  // services/slack/slack-signature.ts.
  app.use("/api/slack/events", express.raw({ type: "application/json" }), slackEvents);

  // Slack redirects the ADMIN'S BROWSER here after they approve the "Add to
  // Slack" install — a plain GET with no Bearer token possible, so this must
  // sit outside the authenticated router too (the signed `state` query param
  // is the trust boundary — see slack-oauth.service.ts).
  app.get("/api/slack/oauth/callback", slackOAuthCallback);

  // Same reasoning as Slack above — Stripe also signs over the exact raw
  // body bytes. See services/payments/stripe-checkout.service.ts.
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(isProduction ? "combined" : "dev"));

  // API routes
  app.use("/api", routes);

  // 404 + centralized error handling (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
