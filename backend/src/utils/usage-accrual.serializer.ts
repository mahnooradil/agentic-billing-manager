/**
 * Converts a UsageAccrual document into the shape returned to API clients.
 * See usage-accrual.model.ts's own docstring for why this is a SEPARATE
 * collection from Billing, never merged into it.
 */
import type { UsageAccrualDocument } from "@/models/usage-accrual.model";
import type { PlatformConnectionDocument } from "@/models/platform-connection.model";

export interface PublicUsageAccrualConnection {
  id: string;
  displayName: string;
  platform: string;
}

export interface PublicUsageAccrual {
  id: string;
  connection: PublicUsageAccrualConnection;
  amount: number;
  currency: string;
  snapshotAt: Date;
  notes?: string;
}

export function toPublicUsageAccrual(doc: UsageAccrualDocument): PublicUsageAccrual {
  const connection = doc.platformConnection as unknown as PlatformConnectionDocument | null;

  return {
    id: doc._id.toString(),
    connection: connection
      ? {
          id: connection._id.toString(),
          displayName: connection.displayName,
          platform: connection.platform,
        }
      : { id: "", displayName: "Unknown connection", platform: "" },
    amount: doc.amount,
    currency: doc.currency,
    snapshotAt: doc.snapshotAt,
    notes: doc.notes,
  };
}
