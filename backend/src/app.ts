import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { env, isProduction } from "@/config/env";
import routes from "@/routes";
import { slackEvents } from "@/controllers/slack.controller";
import { notFound } from "@/middlewares/notFound";
import { errorHandler } from "@/middlewares/errorHandler";

/**
 * Builds and configures the Express application.
 * Kept separate from the server bootstrap (server.ts) for testability.
 */
export function createApp(): Application {
  const app = express();

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
