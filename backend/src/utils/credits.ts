/**
 * Credit balance enforcement — the counterpart to the ledger's grant/consume
 * (services/credits/credit-ledger.service.ts). Same idiom as plan-limits.ts:
 * throws an AppError when the ACTIVE workspace is out of credits, called
 * BEFORE starting an action that would cost credits (usage is only known
 * after it runs, so this is what actually stops further use, not the
 * after-the-fact deduction). Credits belong to the organization, not the
 * individual member — see Organization model's docstring.
 */
import { AppError } from "@/utils/appError";
import type { OrganizationDocument } from "@/models/organization.model";

/** Throws a 403 if this organization has no credits left to spend. */
export function assertCreditBalance(organization: OrganizationDocument): void {
  if (organization.creditsBalance <= 0) {
    throw new AppError(
      "This workspace has used all its credits. Add more credits to keep chatting with the Billing Advisor.",
      403
    );
  }
}
