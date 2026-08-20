/**
 * Credit ledger — the only place that mutates `User.creditsBalance`. Every
 * change writes a matching `CreditTransaction` so the balance is always
 * explainable, not just a bare number. Both directions use an atomic `$inc`
 * (never read-then-write) so concurrent turns for the same user can't race
 * each other into a wrong balance.
 */
import type { Types } from "mongoose";

import { User } from "@/models/user.model";
import {
  CreditTransaction,
  type CreditTransactionType,
} from "@/models/credit-transaction.model";

async function applyDelta(
  userId: Types.ObjectId | string,
  type: CreditTransactionType,
  delta: number,
  reason: string
): Promise<number | null> {
  const updated = await User.findByIdAndUpdate(
    userId,
    { $inc: { creditsBalance: delta } },
    { new: true }
  );
  if (!updated) return null;

  await CreditTransaction.create({
    user: userId,
    type,
    amount: delta,
    balanceAfter: updated.creditsBalance,
    reason,
  });
  return updated.creditsBalance;
}

/** Adds credits (signup grant, purchase, refund, manual top-up). */
export async function grantCredits(
  userId: Types.ObjectId | string,
  amount: number,
  reason: string,
  type: "grant" | "purchase" | "refund" = "grant"
): Promise<number | null> {
  return applyDelta(userId, type, Math.abs(amount), reason);
}

/**
 * Deducts credits for actual usage (e.g. one Billing Advisor Agent turn).
 * Best-effort: never throws — a ledger-write failure must not break the
 * response the user already received. The balance can end up slightly below
 * zero (the cost already happened); the NEXT turn is what gets blocked, via
 * `assertCreditBalance` (see utils/credits.ts), not this call.
 */
export async function consumeCredits(
  userId: Types.ObjectId | string,
  amount: number,
  reason: string
): Promise<void> {
  try {
    await applyDelta(userId, "consume", -Math.abs(amount), reason);
  } catch {
    // Best-effort — see docstring.
  }
}
