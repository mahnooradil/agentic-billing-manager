/**
 * Credit-cycle scheduler — the recurring half of the plan-tier credit
 * allowance (see config/credits.ts's `CREDIT_ALLOWANCE_BY_PLAN` and
 * `CREDIT_CYCLE_DAYS_BY_PLAN`). Every other credit change (`consumeCredits`)
 * reacts to real AI usage as it happens; the allowance needs to come back
 * purely because a new cycle started, so it runs on its own clock instead,
 * same pattern as services/notification/due-date-scheduler.ts.
 *
 * Credits live on the Organization directly (see its model's docstring), so
 * this iterates organizations — no per-user lookup needed at all. Cycle
 * length varies by plan (short for Free, a full year for Pro/Business), so
 * "due for reset" can't be a single global cutoff: each org's own plan tier
 * decides how long its cycle is. config/plans.ts itself is never touched
 * here — only its `PlanTier` value is used as a lookup key into
 * config/credits.ts's own mapping.
 *
 * No payment processor is wired up yet, so there's no real billing anchor
 * date — each org's cycle is a rolling window from its last reset (or from
 * its creation, for one that's never been reset) rather than a calendar
 * date, so it stays correct regardless of when it was created.
 */
import { Organization } from "@/models/organization.model";
import {
  CREDIT_ALLOWANCE_BY_PLAN,
  CREDIT_CYCLE_DAYS_BY_PLAN,
} from "@/config/credits";
import { resetCreditsForNewCycle } from "@/services/credits/credit-ledger.service";

const DAY_MS = 24 * 60 * 60 * 1000;
// The shortest configured cycle — used only to pre-filter candidates cheaply;
// each candidate's actual due-ness is still checked against THEIR OWN plan's
// cycle length below, so a longer-cycle plan is never reset early.
const SHORTEST_CYCLE_DAYS = Math.min(...Object.values(CREDIT_CYCLE_DAYS_BY_PLAN));

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** Run once shortly after startup too, so a fresh deploy/restart doesn't
 *  wait up to half a day before the first check. */
const STARTUP_DELAY_MS = 60_000;

async function runOnce(): Promise<void> {
  const roughCutoff = new Date(Date.now() - SHORTEST_CYCLE_DAYS * DAY_MS);
  const candidates = await Organization.find({
    $or: [{ lastCreditResetAt: { $exists: false } }, { lastCreditResetAt: { $lte: roughCutoff } }],
  }).select("_id planTier lastCreditResetAt");

  for (const organization of candidates) {
    try {
      const cycleDays = CREDIT_CYCLE_DAYS_BY_PLAN[organization.planTier];
      const dueAt = organization.lastCreditResetAt
        ? new Date(organization.lastCreditResetAt.getTime() + cycleDays * DAY_MS)
        : null;
      // An org never reset before is always due; otherwise only once ITS
      // OWN plan's cycle length has actually elapsed (a Pro/Business org
      // caught by the rough 30-day pre-filter but not yet at its 365-day
      // mark is skipped here, not reset early).
      if (dueAt && dueAt.getTime() > Date.now()) continue;

      const allowance = CREDIT_ALLOWANCE_BY_PLAN[organization.planTier];
      await resetCreditsForNewCycle(organization._id, allowance, "plan_credit_cycle_reset");
    } catch {
      // One organization's reset failing must never abort the rest of the run.
    }
  }
}

function runOnceSafe(): void {
  void runOnce().catch(() => {
    // Best-effort — a missed check is caught by the next interval.
  });
}

/** Starts the recurring credit-cycle reset. Fire-and-forget; never throws. */
export function startCreditResetScheduler(): void {
  setTimeout(runOnceSafe, STARTUP_DELAY_MS);
  setInterval(runOnceSafe, CHECK_INTERVAL_MS);
}
