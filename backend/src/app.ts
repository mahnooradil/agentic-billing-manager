import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { env, isProduction } from "@/config/env";
import routes from "@/routes";
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
