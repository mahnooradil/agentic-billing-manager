/**
 * Credits controller — the ACTIVE workspace's credit balance and recent
 * ledger history (see services/credits/, models/credit-transaction.model.ts).
 * Credits belong to the organization, not the individual member — see
 * Organization model's docstring — so this reflects whichever workspace
 * `req.organization` currently resolves to, the same one every other
 * business-data endpoint is scoped to.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { CreditTransaction } from "@/models/credit-transaction.model";
import { toPublicCreditTransaction } from "@/utils/credit-transaction.serializer";
import {
  CREDIT_ALLOWANCE_BY_PLAN,
  CREDIT_CYCLE_DAYS_BY_PLAN,
  TOKENS_PER_CREDIT,
} from "@/config/credits";

const RECENT_TRANSACTIONS_LIMIT = 50;

/** GET /api/credits — the active workspace's balance + recent transaction
 *  history, plus its plan's credit allowance/cycle length (informational
 *  context for the balance — see config/credits.ts; NOT read from
 *  config/plans.ts, which has no credits field of its own). */
export const getMyCredits = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) throw new AppError("Authentication required", 401);

  const transactions = await CreditTransaction.find({ organization: organization._id })
    .sort({ createdAt: -1 })
    .limit(RECENT_TRANSACTIONS_LIMIT);

  sendSuccess(res, 200, "Credits retrieved", {
    balance: organization.creditsBalance,
    tokensPerCredit: TOKENS_PER_CREDIT,
    allowance: CREDIT_ALLOWANCE_BY_PLAN[organization.planTier],
    cycleDays: CREDIT_CYCLE_DAYS_BY_PLAN[organization.planTier],
    transactions: transactions.map(toPublicCreditTransaction),
  });
});
