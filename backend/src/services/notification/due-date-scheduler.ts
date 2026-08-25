/**
 * Due-date scheduler — the recurring half of two time-driven rules: flipping
 * a "Pending" record to "Overdue" once its due date has passed
 * (`autoMarkOverdue`), and the "payment due soon" alert
 * (`runDueDateNotifications`). Every other notification rule reacts to a
 * business-data change on the event bus; these two need re-checking purely
 * because time passed, so they run on their own clock instead. Overdue is
 * marked first so the due-soon pass never has to reason about a record
 * that should already be Overdue.
 */
import { runDueDateNotifications, autoMarkOverdue } from "@/services/notification/notification-engine";

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** Run once shortly after startup too, so a fresh deploy/restart doesn't
 *  wait up to half a day before the first check. */
const STARTUP_DELAY_MS = 60_000;

function runOnce(): void {
  void autoMarkOverdue()
    .then(() => runDueDateNotifications())
    .catch(() => {
      // Best-effort — a missed check is caught by the next interval.
    });
}

/** Starts the recurring due-date check. Fire-and-forget; never throws. */
export function startDueDateScheduler(): void {
  setTimeout(runOnce, STARTUP_DELAY_MS);
  setInterval(runOnce, CHECK_INTERVAL_MS);
}
