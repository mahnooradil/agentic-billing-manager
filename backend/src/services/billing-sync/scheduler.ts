/**
 * Billing-sync scheduler — the "all the time," not "just once at connect"
 * half of auto-sync. Every `SYNC_INTERVAL_MS`, re-pulls billing data for every
 * connection whose platform has a registered adapter, across every user.
 */
import { PlatformConnection } from "@/models/platform-connection.model";
import { syncConnectionBilling } from "@/services/billing-sync/sync-engine";

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function runSyncPass(): Promise<void> {
  const connections = await PlatformConnection.find({
    connectionType: "oauth",
    status: "connected",
  });
  for (const connection of connections) {
    await syncConnectionBilling(connection);
  }
}

/** Starts the recurring billing-sync job. Fire-and-forget; never throws. */
export function startBillingSyncScheduler(): void {
  setInterval(() => {
    void runSyncPass();
  }, SYNC_INTERVAL_MS);
}
