/**
 * Email-sync engine — scans ONE connected inbox (Gmail or Outlook) for
 * invoice-like messages and upserts parsed fields into the Billing
 * collection with `source: "email_sync"`. A fallback channel behind
 * services/billing-sync: only runs for platforms with no billing-sync
 * adapter coverage (see registry.ts). Idempotent and best-effort, mirroring
 * services/billing-sync/sync-engine.ts's safety guarantees — never throws,
 * one bad message never aborts the run.
 *
 * Provider-agnostic: everything specific to Gmail vs Outlook (search-query
 * syntax, raw API shape, message normalization) lives behind provider.ts's
 * EmailSyncProvider; this file only knows the loop (pagination, safety cap,
 * watermark, dedupe/upsert).
 *
 * Called from two places: right after an email-sync connection is created
 * (one immediate pull) and by the recurring scheduler (scheduler.ts).
 */
import { Billing } from "@/models/billing.model";
import {
  PlatformConnection,
  type PlatformConnectionDocument,
} from "@/models/platform-connection.model";
import { emitBusinessDataChanged } from "@/services/events/event-bus";
import {
  getEmailSyncProvider,
  type EmailSyncProvider,
  type NormalizedEmailMessage,
} from "@/services/email-sync/provider";
import { parseInvoiceFields, parseSender } from "@/services/email-sync/parser";

const MAX_MESSAGES_PER_RUN = 200;
const PAGE_SIZE = 50;
const OVERLAP_DAYS = 1;

interface EmailSyncState {
  lastSyncedAt?: string;
}
interface AccountMetadata {
  pipedreamAccountId?: string;
  emailSync?: EmailSyncState;
}

/**
 * Syncs one email-sync connection. Silently does nothing if the platform
 * isn't a supported email-sync source or has no Pipedream account id yet.
 * Never throws.
 */
export async function syncConnectionEmail(
  connection: PlatformConnectionDocument
): Promise<void> {
  const provider = getEmailSyncProvider(connection.platform);
  if (!provider) return;

  const meta = connection.metadata as AccountMetadata | undefined;
  const pipedreamAccountId = meta?.pipedreamAccountId;
  if (!pipedreamAccountId) return;

  const externalUserId = connection.user.toString();
  const runStartedAt = new Date();
  const sinceDate = meta?.emailSync?.lastSyncedAt
    ? new Date(
        new Date(meta.emailSync.lastSyncedAt).getTime() - OVERLAP_DAYS * 86_400_000
      )
    : null;
  const query = provider.buildSearchQuery(sinceDate);

  let processed = 0;
  let created = 0;
  let hitCap = false;
  let stoppedEarly = false;
  let pageToken: string | undefined;

  try {
    do {
      const page = await provider.listCandidateMessageIds(
        externalUserId,
        pipedreamAccountId,
        query,
        PAGE_SIZE,
        pageToken
      );
      for (const messageId of page.messageIds) {
        if (processed >= MAX_MESSAGES_PER_RUN) {
          hitCap = true;
          break;
        }
        processed++;
        try {
          const message = await provider.getMessage(
            externalUserId,
            pipedreamAccountId,
            messageId
          );
          if (!message) continue;

          // Some providers (Outlook) can't narrow their search by date
          // server-side — their results are newest-first, so walking past
          // `sinceDate` means everything after this point was already synced.
          if (
            provider.sortedNewestFirstUnfiltered &&
            sinceDate &&
            message.receivedAt.getTime() < sinceDate.getTime()
          ) {
            stoppedEarly = true;
            break;
          }

          const wasCreated = await processNormalizedMessage(connection, provider, message);
          if (wasCreated) created++;
        } catch {
          // One bad/unreachable message must never abort the whole run.
        }
      }
      pageToken = hitCap || stoppedEarly ? undefined : page.nextPageToken;
    } while (pageToken);

    // Only advance the watermark when the search window was fully drained —
    // if the safety cap was hit, leave it unchanged so the next run resumes
    // the same backlog instead of silently skipping whatever didn't fit.
    // Stopping early because the results ran past `sinceDate` (Outlook) IS a
    // fully-drained window, so it still advances the watermark.
    if (!hitCap) {
      await PlatformConnection.updateOne(
        { _id: connection._id },
        { $set: { "metadata.emailSync": { lastSyncedAt: runStartedAt.toISOString() } } }
      );
    }

    if (created > 0) {
      emitBusinessDataChanged({
        source: "billing",
        action: "create",
        triggeredBy: externalUserId,
      });
    }
  } catch {
    // Best-effort: a provider hiccup must not affect other connections/users.
  }
}

async function processNormalizedMessage(
  connection: PlatformConnectionDocument,
  provider: EmailSyncProvider,
  message: NormalizedEmailMessage
): Promise<boolean> {
  const fields = parseInvoiceFields(message.plainText, message.receivedAt);
  // Billing.amount and .currency are required — guessing either wrong is worse
  // than skipping this message, so both must be confidently parsed.
  if (fields.amount === null || fields.currency === null) return false;

  const { displayName, domain } = parseSender(message.fromHeader ?? undefined);
  const vendorSlug =
    (domain ?? "unknown")
      .replace(/\.(com|net|org|io|co)$/i, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase() || "unknown";
  const customerName =
    displayName ??
    (vendorSlug !== "unknown" ? vendorSlug[0].toUpperCase() + vendorSlug.slice(1) : "Email invoice");
  const invoiceNumber =
    fields.invoiceNumber ?? `EMAIL-${message.id.slice(0, 10).toUpperCase()}`;

  // Prefer a semantic dedupe key (vendor + invoice number) over the raw message
  // id: an initial "your invoice" email and a later "payment received" receipt
  // for the SAME invoice then update ONE record's status instead of creating
  // two disconnected rows. Namespaced by vendor domain to avoid cross-vendor
  // invoice-number collisions, and by provider to avoid cross-provider ones.
  const externalId = fields.invoiceNumber
    ? `${provider.dedupePrefix}-inv-${vendorSlug}-${fields.invoiceNumber.replace(/[^A-Za-z0-9-]/g, "").toLowerCase()}`
    : `${provider.dedupePrefix}-msg-${message.id}`;

  const dedupeQuery = {
    organization: connection.organization,
    platformConnection: connection._id,
    externalId,
  };
  const existedBefore = await Billing.exists(dedupeQuery);

  await Billing.findOneAndUpdate(
    dedupeQuery,
    {
      $set: {
        organization: connection.organization,
        user: connection.user,
        platformConnection: connection._id,
        source: "email_sync",
        externalId,
        customerName,
        invoiceNumber,
        amount: fields.amount,
        currency: fields.currency,
        billingDate: fields.billingDate,
        status: fields.status,
        notes: provider.notesText,
      },
    },
    { upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  return !existedBefore;
}
