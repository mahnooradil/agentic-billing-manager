/**
 * Credit ledger — the only place that mutates `Organization.creditsBalance`.
 * Every change writes a matching `CreditTransaction` so the balance is
 * always explainable, not just a bare number. Both directions use an atomic
 * `$inc` (never read-then-write) so concurrent turns for the same workspace
 * can't race each other into a wrong balance.
 *
 * Credits are scoped to the ORGANIZATION (whoever's plan is actually paying
 * for it), not the individual member whose action triggered the cost — an
 * optional `userId` is still recorded on the ledger entry purely as an audit
 * trail of which member did it, never as what the balance is tracked against.
 */
import type { Types } from "mongoose";

import { Organization } from "@/models/organization.model";
import {
  CreditTransaction,
  type CreditTransactionType,
} from "@/models/credit-transaction.model";

async function applyDelta(
  organizationId: Types.ObjectId | string,
  type: CreditTransactionType,
  delta: number,
  reason: string,
  userId?: Types.ObjectId | string
): Promise<number | null> {
  const updated = await Organization.findByIdAndUpdate(
    organizationId,
    { $inc: { creditsBalance: delta } },
    { new: true }
  );
  if (!updated) return null;

  await CreditTransaction.create({
    organization: organizationId,
    user: userId,
    type,
    amount: delta,
    balanceAfter: updated.creditsBalance,
    reason,
  });
  return updated.creditsBalance;
}

/** Adds credits (signup grant, purchase, refund, manual top-up) to a workspace. */
export async function grantCredits(
  organizationId: Types.ObjectId | string,
  amount: number,
  reason: string,
  type: "grant" | "purchase" | "refund" = "grant",
  userId?: Types.ObjectId | string
): Promise<number | null> {
  return applyDelta(organizationId, type, Math.abs(amount), reason, userId);
}

/**
 * Deducts credits for actual usage (e.g. one Billing Advisor Agent turn) from
 * the workspace the acting member was in AT THE TIME. Best-effort: never
 * throws — a ledger-write failure must not break the response the user
 * already received. The balance can end up slightly below zero (the cost
 * already happened); the NEXT turn is what gets blocked, via
 * `assertCreditBalance` (see utils/credits.ts), not this call.
 */
export async function consumeCredits(
  organizationId: Types.ObjectId | string,
  amount: number,
  reason: string,
  userId?: Types.ObjectId | string
): Promise<void> {
  try {
    await applyDelta(organizationId, "consume", -Math.abs(amount), reason, userId);
  } catch {
    // Best-effort — see docstring.
  }
}

/**
 * Sets a workspace's balance to its plan's credit allowance for a fresh
 * cycle (see services/credits/credit-reset-scheduler.ts — cycle length
 * varies by plan tier, e.g. monthly for Free, yearly for Pro/Business) — a
 * hard reset, not a top-up: unused credits don't roll over, and a balance
 * left negative from the prior cycle is brought back to the fresh allowance
 * rather than staying negative forever. Uses a single atomic `$set` (not
 * `$inc`) so it can't race a concurrent `consumeCredits` call into an
 * inconsistent balance; the ledger entry's `amount` is derived from the
 * balance just before the set, read off the same atomic operation.
 * Best-effort, like `consumeCredits` — a missed reset is caught by the next
 * scheduled run. No single member triggers this, so no `userId` is recorded.
 */
export async function resetCreditsForNewCycle(
  organizationId: Types.ObjectId | string,
  targetBalance: number,
  reason: string
): Promise<void> {
  try {
    const previous = await Organization.findByIdAndUpdate(organizationId, {
      $set: { creditsBalance: targetBalance, lastCreditResetAt: new Date() },
    });
    if (!previous) return;

    await CreditTransaction.create({
      organization: organizationId,
      type: "reset",
      amount: targetBalance - previous.creditsBalance,
      balanceAfter: targetBalance,
      reason,
    });
  } catch {
    // Best-effort — see docstring.
  }
}
