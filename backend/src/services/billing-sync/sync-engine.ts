/**
 * Billing-sync engine — pulls fresh billing data for ONE connection (if a
 * billing-sync adapter is registered for its platform). Idempotent:
 * re-running never duplicates records, it only refreshes them (keyed by
 * `{organization, platformConnection, externalId}`).
 *
 * WP-4 — routes by the adapter's own declared `kind` (see
 * billing-sync/types.ts's `BillingSyncRecordKind`): a real, discrete
 * invoice (5 of 129 adapters) still goes to `Billing` exactly as before;
 * month-to-date usage/balance (the other 124) now goes to the separate
 * `UsageAccrual` collection instead of being mixed into `Billing` as a
 * permanently-"Pending" row that could never actually clear.
 *
 * Called from two places: right after a connection is created (one immediate
 * pull) and by the recurring scheduler (services/billing-sync/scheduler.ts).
 */
import { Billing } from "@/models/billing.model";
import { UsageAccrual } from "@/models/usage-accrual.model";
import { PlatformConnection, type PlatformConnectionDocument } from "@/models/platform-connection.model";
import { getBillingSyncAdapter } from "@/services/billing-sync/registry";
import { resolveVendor } from "@/services/vendors/vendor-resolver.service";

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

    if (adapter.kind === "invoice") {
      // Real vendor identity (Task 7) — resolved once per connection, since
      // every record from this connection is the same vendor. No domain
      // (a platform's own billing API has no sending domain to observe) —
      // dedupes by name instead, so this collapses onto the SAME Vendor
      // document as an email-derived one for the same real vendor if that
      // name matches (e.g. both resolve to "AWS"), fixing the double-count
      // the audit describes for a vendor connected through two channels.
      const vendorDoc =
        records.length > 0
          ? await resolveVendor(connection.organization, { name: connection.displayName })
          : null;

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
              ...(vendorDoc ? { vendor: vendorDoc._id } : {}),
              ...(vendorDoc?.domain ? { vendorDomain: vendorDoc.domain } : {}),
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
    } else {
      // kind === "usage_accrual" — month-to-date usage/balance, never an
      // outstanding obligation. See usage-accrual.model.ts's own docstring
      // for why this is a separate collection, not a Billing row.
      for (const record of records) {
        await UsageAccrual.findOneAndUpdate(
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
              externalId: record.externalId,
              amount: record.amount,
              currency: record.currency,
              snapshotAt: record.billingDate,
              notes: record.notes,
            },
          },
          { upsert: true, setDefaultsOnInsert: true, runValidators: true }
        );
      }
    }

    // Sync observability (S-17 fix) — see email-sync/sync-engine.ts's
    // identical pattern for the full reasoning.
    await PlatformConnection.updateOne(
      { _id: connection._id },
      {
        $set: { lastSyncAt: new Date(), lastSyncStatus: "success", invoicesFound: records.length },
        $unset: { lastSyncError: "" },
      }
    ).catch(() => {
      // Best-effort — never let an observability write fail the sync itself.
    });
  } catch (error) {
    // Previously a bare `catch {}` (S-17) — see email-sync/sync-engine.ts's
    // identical pattern for the full reasoning.
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[billing-sync] connection ${connection._id.toString()} (${connection.platform}) failed:`,
      message
    );
    await PlatformConnection.updateOne(
      { _id: connection._id },
      {
        $set: {
          lastSyncAt: new Date(),
          lastSyncStatus: "error",
          lastSyncError: "The last sync attempt failed. It will retry automatically.",
        },
      }
    ).catch(() => {
      // Best-effort — never let an observability write fail the sync itself.
    });
  }
}
