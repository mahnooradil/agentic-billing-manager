/**
 * Credits controller — the current user's credit balance and recent ledger
 * history (see services/credits/, models/credit-transaction.model.ts). The
 * balance itself is also embedded in every `PublicUser` response (register/
 * login/me), so this endpoint is really just for the history list.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { CreditTransaction } from "@/models/credit-transaction.model";
import { toPublicCreditTransaction } from "@/utils/credit-transaction.serializer";
import { TOKENS_PER_CREDIT } from "@/config/credits";

const RECENT_TRANSACTIONS_LIMIT = 50;

/** GET /api/credits — the current user's balance + recent transaction history. */
export const getMyCredits = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError("Authentication required", 401);

  const transactions = await CreditTransaction.find({ user: user._id })
    .sort({ createdAt: -1 })
    .limit(RECENT_TRANSACTIONS_LIMIT);

  sendSuccess(res, 200, "Credits retrieved", {
    balance: user.creditsBalance,
    tokensPerCredit: TOKENS_PER_CREDIT,
    transactions: transactions.map(toPublicCreditTransaction),
  });
});
