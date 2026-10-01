import type { Server } from "http";

import { createApp } from "@/app";
import { env } from "@/config/env";
import { connectDatabase, disconnectDatabase } from "@/config/database";
import { syncIndexesIfEnabled, assertIndexesInSync } from "@/config/index-integrity";
import { initRecommendationEngine } from "@/services/ai/recommendation-engine";
import { initNotificationEngine } from "@/services/notification/notification-engine";
import { startDueDateScheduler } from "@/services/notification/due-date-scheduler";
import { warmCatalogCache } from "@/services/integrations/pipedream";
import { startBillingSyncScheduler } from "@/services/billing-sync/scheduler";
import { startEmailSyncScheduler } from "@/services/email-sync/scheduler";
import { startCreditResetScheduler } from "@/services/credits/credit-reset-scheduler";
import { startCreditReconciliationScheduler } from "@/services/credits/credit-reconciliation-scheduler";
import { assertNoLiveStripeKeyOutsideProduction } from "@/services/payments/stripe-subscription.service";
import { assertEncryptionKeyConfigured } from "@/utils/crypto";

/**
 * Server bootstrap / entry point.
 *
 * Startup order:
 *   1. Environment variables are loaded (via config/env import side-effect).
 *   2. Connect to MongoDB — the app does not accept traffic until this succeeds.
 *   3. Index integrity (S-01) — optionally sync, then always verify every
 *      declared index actually exists before anything touches the data.
 *   4. Start the Express server only after all of the above succeeds.
 *
 * On a database connection failure — or a missing index the app's own data
 * integrity depends on — a clear error is logged and the process exits
 * gracefully so orchestrators (Docker/Render/etc.) can restart it.
 */
async function startServer(): Promise<void> {
  try {
    // 0: refuse to boot at all with a live Stripe key outside production
    // (Task 10) — a pure config check, no database needed, so it runs
    // before anything else has a chance to touch real money by mistake.
    assertNoLiveStripeKeyOutsideProduction();

    // 0b: refuse to boot without AI_ENCRYPTION_KEY (WP-7 hardening) — same
    // "fail loudly at startup" reasoning, for the secret that protects every
    // stored platform credential and Slack bot token.
    assertEncryptionKeyConfigured();

    // 1 + 2: connect to the database before starting Express.
    await connectDatabase();

    // 3: index integrity — see config/index-integrity.ts. Must happen before
    // schedulers/engines below touch any data.
    await syncIndexesIfEnabled();
    await assertIndexesInSync();

    // Wire autonomous engines to the event bus before serving traffic.
    initRecommendationEngine();
    initNotificationEngine();
    warmCatalogCache();
    startBillingSyncScheduler();
    startEmailSyncScheduler();
    startDueDateScheduler();
    startCreditResetScheduler();
    startCreditReconciliationScheduler();

    // 4: database and indexes are ready — start accepting HTTP traffic.
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
