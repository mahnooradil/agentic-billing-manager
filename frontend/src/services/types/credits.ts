/**
 * Credit ledger domain types — mirrors backend `PublicCreditTransaction`.
 * Dates arrive as ISO strings over JSON.
 */
export type CreditTransactionType = "grant" | "consume" | "purchase" | "refund";

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
  transactions: CreditTransaction[];
}
