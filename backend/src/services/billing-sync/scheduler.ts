/**
 * Billing-sync scheduler — the "all the time," not "just once at connect"
 * half of auto-sync. Every `SYNC_INTERVAL_MS`, re-pulls billing data for every
 * connection whose platform has a registered adapter, across every user.
 */
import { PlatformConnection } from "@/models/platform-connection.model";
import { syncConnectionBilling } from "@/services/billing-sync/sync-engine";
import {
  DEFAULT_BILLING_SYNC_INTERVAL_MINUTES,
  isSyncDue,
} from "@/services/platform-connections/sync-schedule";

/** How often this scheduler WAKES UP to check what's due — not how often any
 *  one connection actually syncs (that's each connection's own
 *  `syncIntervalMinutes`, defaulting to DEFAULT_BILLING_SYNC_INTERVAL_MINUTES).
 *  Must be small enough that the shortest allowed override (15min, see
 *  SYNC_INTERVAL_OPTIONS_MINUTES) is still checked often enough to feel
 *  responsive. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Run once shortly after startup too — mirrors email-sync/scheduler.ts's
 *  identical fix: a restart resets a bare setInterval's clock to zero, so on
 *  a host that redeploys more often than the interval, the recurring pass
 *  could go a very long time without ever actually firing. */
const STARTUP_DELAY_MS = 60_000;

async function runSyncPass(): Promise<void> {
  const connections = await PlatformConnection.find({
    connectionType: "oauth",
    status: "connected",
  });
  for (const connection of connections) {
    if (!isSyncDue(connection, DEFAULT_BILLING_SYNC_INTERVAL_MINUTES)) continue;
    await syncConnectionBilling(connection);
  }
}

/** Starts the recurring billing-sync job. Fire-and-forget; never throws. */
export function startBillingSyncScheduler(): void {
  setTimeout(() => {
    void runSyncPass();
  }, STARTUP_DELAY_MS);
  setInterval(() => {
    void runSyncPass();
  }, CHECK_INTERVAL_MS);
}
