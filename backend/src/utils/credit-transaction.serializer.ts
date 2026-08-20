/**
 * Converts a credit transaction document into the wire shape.
 */
import type { CreditTransactionDocument } from "@/models/credit-transaction.model";
import type { CreditTransactionType } from "@/models/credit-transaction.model";

export interface PublicCreditTransaction {
  id: string;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: Date;
}

export function toPublicCreditTransaction(
  doc: CreditTransactionDocument
): PublicCreditTransaction {
  return {
    id: doc._id.toString(),
    type: doc.type,
    amount: doc.amount,
    balanceAfter: doc.balanceAfter,
    reason: doc.reason,
    createdAt: doc.createdAt,
  };
}
