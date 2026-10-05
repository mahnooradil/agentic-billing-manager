/**
 * Email-sync scheduler — the "all the time," not "just once at connect" half of
 * the Gmail/Outlook fallback channel. Mirrors services/billing-sync/scheduler.ts's
 * shape but runs more frequently (1h vs 6h) since email can arrive anytime.
 */
import { PlatformConnection } from "@/models/platform-connection.model";
import { syncConnectionEmail } from "@/services/email-sync/sync-engine";
import { isEmailSyncPlatform } from "@/services/email-sync/registry";
import {
  DEFAULT_EMAIL_SYNC_INTERVAL_MINUTES,
  isSyncDue,
} from "@/services/platform-connections/sync-schedule";

/** How often this scheduler WAKES UP to check what's due — not how often any
 *  one connection actually syncs (that's each connection's own
 *  `syncIntervalMinutes`, defaulting to DEFAULT_EMAIL_SYNC_INTERVAL_MINUTES).
 *  Must be small enough that the shortest allowed override (15min, see
 *  SYNC_INTERVAL_OPTIONS_MINUTES) is still checked often enough to feel
 *  responsive. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Run once shortly after startup too — otherwise a restart resets this
 *  clock to zero, and on a host that redeploys/restarts more often than the
 *  interval (observed in production: a connection's lastSyncedAt sat still
 *  for over a day), the recurring pass could go a very long time without
 *  ever actually firing. Mirrors due-date-scheduler.ts's identical fix. */
const STARTUP_DELAY_MS = 60_000;

async function runSyncPass(): Promise<void> {
  const connections = await PlatformConnection.find({
    connectionType: "oauth",
    status: "connected",
  });
  for (const connection of connections) {
    if (!isEmailSyncPlatform(connection.platform)) continue;
    if (!isSyncDue(connection, DEFAULT_EMAIL_SYNC_INTERVAL_MINUTES)) continue;
    await syncConnectionEmail(connection);
  }
}

/** Starts the recurring email-sync job. Fire-and-forget; never throws. */
export function startEmailSyncScheduler(): void {
  setTimeout(() => {
    void runSyncPass();
  }, STARTUP_DELAY_MS);
  setInterval(() => {
    void runSyncPass();
  }, CHECK_INTERVAL_MS);
}
