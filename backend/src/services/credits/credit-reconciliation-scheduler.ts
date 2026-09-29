/**
 * Credit ledger reconciliation — Task 10's own acceptance item ("a nightly
 * reconciliation job: sum(CreditTransaction.amount) === creditsBalance"),
 * flagged specifically because real money now flows through this system
 * (Stripe credit purchases + paid-tier subscriptions) and a silently
 * drifted balance is a real customer-trust and revenue problem, not just a
 * cosmetic one. Every `CreditTransaction` is an immutable, signed delta
 * (see its own model docstring) — summing them for an organization should
 * always exactly equal that organization's current `creditsBalance`, since
 * both start at 0 and every balance change is, by design, recorded as one
 * of these entries. A mismatch means something wrote to `creditsBalance`
 * without going through the ledger (a bug elsewhere, not something this
 * job fixes) — this only DETECTS and loudly logs that, it never
 * "corrects" a balance on its own, since guessing which side is wrong
 * would risk making a real discrepancy worse.
 */
import { Organization } from "@/models/organization.model";
import { CreditTransaction } from "@/models/credit-transaction.model";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Run once shortly after startup too, so a fresh deploy/restart doesn't
 *  wait up to a full day before the first check. */
const STARTUP_DELAY_MS = 5 * 60_000;
/** A tiny rounding-error allowance — credit math should be integer-clean
 *  today, but a floating-point delta of a fraction of a credit is not
 *  worth paging anyone over. */
const EPSILON = 1e-6;

interface DriftedOrg {
  organizationId: string;
  storedBalance: number;
  ledgerSum: number;
  drift: number;
}

/** Exported so tests can exercise the actual detection logic directly,
 *  without waiting on (or fake-timing) the real interval/timeout below. */
export async function runOnce(): Promise<void> {
  const [ledgerSums, organizations] = await Promise.all([
    CreditTransaction.aggregate<{ _id: string; sum: number }>([
      { $group: { _id: "$organization", sum: { $sum: "$amount" } } },
    ]),
    Organization.find().select("_id creditsBalance"),
  ]);

  const ledgerSumByOrg = new Map(ledgerSums.map((row) => [row._id.toString(), row.sum]));
  const drifted: DriftedOrg[] = [];

  for (const org of organizations) {
    const ledgerSum = ledgerSumByOrg.get(org._id.toString()) ?? 0;
    const drift = org.creditsBalance - ledgerSum;
    if (Math.abs(drift) > EPSILON) {
      drifted.push({
        organizationId: org._id.toString(),
        storedBalance: org.creditsBalance,
        ledgerSum,
        drift,
      });
    }
  }

  if (drifted.length > 0) {
    // A real, loud signal for an operator — not a silent no-op. Detection
    // only; see the module docstring for why this never auto-corrects.
    console.error(
      `[credit-reconciliation] ${drifted.length} organization(s) have a credits ledger mismatch:`,
      JSON.stringify(drifted)
    );
  }
}

function runOnceSafe(): void {
  void runOnce().catch((error: unknown) => {
    console.error(
      "[credit-reconciliation] check itself failed (not a drift finding — a real error running it):",
      error instanceof Error ? error.message : String(error)
    );
  });
}

/** Starts the recurring credit-ledger reconciliation check. Fire-and-forget;
 *  never throws, never blocks startup. */
export function startCreditReconciliationScheduler(): void {
  setTimeout(runOnceSafe, STARTUP_DELAY_MS);
  setInterval(runOnceSafe, CHECK_INTERVAL_MS);
}
