import { createApp } from "@/app";
import { env } from "@/config/env";

/**
 * Server bootstrap / entry point.
 * Database connections (MongoDB) will be initialized here in a later phase.
 */
function startServer(): void {
  const app = createApp();

  app.listen(env.port, () => {
    console.log(
      `🚀 Backend running in ${env.nodeEnv} mode on http://localhost:${env.port}`
    );
  });
}

startServer();
