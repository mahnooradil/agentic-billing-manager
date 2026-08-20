/**
 * Email-sync scheduler — the "all the time," not "just once at connect" half of
 * the Gmail fallback channel. Mirrors services/billing-sync/scheduler.ts's
 * shape but runs more frequently (1h vs 6h) since email can arrive anytime.
 */
import { PlatformConnection } from "@/models/platform-connection.model";
import { syncConnectionEmail } from "@/services/email-sync/sync-engine";
import { isEmailSyncPlatform } from "@/services/email-sync/registry";

const SYNC_INTERVAL_MS = 60 * 60 * 1000;

async function runSyncPass(): Promise<void> {
  const connections = await PlatformConnection.find({
    connectionType: "oauth",
    status: "connected",
  });
  for (const connection of connections) {
    if (!isEmailSyncPlatform(connection.platform)) continue;
    await syncConnectionEmail(connection);
  }
}

/** Starts the recurring email-sync job. Fire-and-forget; never throws. */
export function startEmailSyncScheduler(): void {
  setInterval(() => {
    void runSyncPass();
  }, SYNC_INTERVAL_MS);
}
