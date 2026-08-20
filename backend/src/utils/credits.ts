/**
 * Credit balance enforcement — the counterpart to the ledger's grant/consume
 * (services/credits/credit-ledger.service.ts). Same idiom as plan-limits.ts:
 * throws an AppError when a user is out of credits, called BEFORE starting an
 * action that would cost credits (usage is only known after it runs, so this
 * is what actually stops further use, not the after-the-fact deduction).
 */
import { AppError } from "@/utils/appError";
import type { UserDocument } from "@/models/user.model";

/** Throws a 403 if this user has no credits left to spend. */
export function assertCreditBalance(user: UserDocument): void {
  if (user.creditsBalance <= 0) {
    throw new AppError(
      "You've used all your credits. Add more credits to keep chatting with the Billing Advisor.",
      403
    );
  }
}
