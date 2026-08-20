/**
 * Billing-sync engine — pulls fresh billing data for ONE connection (if a
 * billing-sync adapter is registered for its platform) and upserts it into the
 * Billing collection. Idempotent: re-running never duplicates records, it only
 * refreshes them (keyed by `{organization, platformConnection, externalId}`).
 *
 * Called from two places: right after a connection is created (one immediate
 * pull) and by the recurring scheduler (services/billing-sync/scheduler.ts).
 */
import { Billing } from "@/models/billing.model";
import type { PlatformConnectionDocument } from "@/models/platform-connection.model";
import { getBillingSyncAdapter } from "@/services/billing-sync/registry";

interface AccountMetadata {
  pipedreamAccountId?: string;
}

/**
 * Syncs one connection. Silently does nothing if there is no adapter for its
 * platform, or it has no Pipedream account id (e.g. not yet fully connected).
 * Never throws — a failed sync must not break the connect flow or the
 * scheduler's pass over every other connection.
 */
export async function syncConnectionBilling(
  connection: PlatformConnectionDocument
): Promise<void> {
  const adapter = getBillingSyncAdapter(connection.platform);
  if (!adapter) return;

  const meta = connection.metadata as AccountMetadata | undefined;
  const pipedreamAccountId = meta?.pipedreamAccountId;
  if (!pipedreamAccountId) return;

  try {
    const records = await adapter.fetchRecords(
      connection.user.toString(),
      pipedreamAccountId
    );

    for (const record of records) {
      await Billing.findOneAndUpdate(
        {
          organization: connection.organization,
          platformConnection: connection._id,
          externalId: record.externalId,
        },
        {
          $set: {
            organization: connection.organization,
            user: connection.user,
            platformConnection: connection._id,
            source: "auto_sync",
            externalId: record.externalId,
            customerName: connection.displayName,
            invoiceNumber: record.externalId,
            amount: record.amount,
            currency: record.currency,
            billingDate: record.billingDate,
            status: record.status,
            notes: record.notes,
          },
        },
        { upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
    }
  } catch {
    // Best-effort: a provider hiccup on one connection must not affect others.
  }
}
