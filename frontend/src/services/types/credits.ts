/**
 * Credit ledger domain types — mirrors backend `PublicCreditTransaction`.
 * Dates arrive as ISO strings over JSON.
 */
export type CreditTransactionType = "grant" | "consume" | "purchase" | "refund" | "reset";

export interface CreditTransaction {
  id: string;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

/** Response `data` shape for `GET /credits`. */
export interface CreditsData {
  balance: number;
  /** How many combined input+output tokens equal one credit — the real,
   *  live rate (not hardcoded on the frontend, in case it's ever tuned). */
  tokensPerCredit: number;
  /** Credits granted per cycle on the account's current plan (independent
   *  of the plan's own feature list — see backend config/credits.ts). */
  allowance: number;
  /** Length of one credit cycle in days (e.g. 30 for Free, 365 for Pro/Business). */
  cycleDays: number;
  transactions: CreditTransaction[];
}
