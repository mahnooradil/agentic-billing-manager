import type { Server } from "http";

import { createApp } from "@/app";
import { env } from "@/config/env";
import { connectDatabase, disconnectDatabase } from "@/config/database";
import { initRecommendationEngine } from "@/services/ai/recommendation-engine";
import { initNotificationEngine } from "@/services/notification/notification-engine";
import { warmCatalogCache } from "@/services/integrations/pipedream";
import { startBillingSyncScheduler } from "@/services/billing-sync/scheduler";

/**
 * Server bootstrap / entry point.
 *
 * Startup order:
 *   1. Environment variables are loaded (via config/env import side-effect).
 *   2. Connect to MongoDB — the app does not accept traffic until this succeeds.
 *   3. Start the Express server only after a successful database connection.
 *
 * On a database connection failure, a clear error is logged and the process
 * exits gracefully so orchestrators (Docker/Render/etc.) can restart it.
 */
async function startServer(): Promise<void> {
  try {
    // 1 + 2: connect to the database before starting Express.
    await connectDatabase();

    // Wire autonomous engines to the event bus before serving traffic.
    initRecommendationEngine();
    initNotificationEngine();
    warmCatalogCache();
    startBillingSyncScheduler();

    // 3: database is ready — start accepting HTTP traffic.
    const app = createApp();
    const server = app.listen(env.port, () => {
      console.log(
        `🚀 Backend running in ${env.nodeEnv} mode on http://localhost:${env.port}`
      );
    });

    registerShutdownHandlers(server);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`💥 Startup aborted — ${message}`);
    process.exit(1);
  }
}

/** Closes the HTTP server and database connection on termination signals. */
function registerShutdownHandlers(server: Server): void {
  const shutdown = (signal: string): void => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void startServer();
