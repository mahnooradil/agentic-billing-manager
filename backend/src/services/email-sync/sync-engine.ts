/**
 * Email-sync engine — scans ONE connected Gmail inbox for invoice-like messages
 * and upserts parsed fields into the Billing collection with `source:
 * "email_sync"`. A fallback channel behind services/billing-sync: only runs for
 * platforms with no billing-sync adapter coverage (see registry.ts). Idempotent
 * and best-effort, mirroring services/billing-sync/sync-engine.ts's safety
 * guarantees — never throws, one bad message never aborts the run.
 *
 * Called from two places: right after a Gmail connection is created (one
 * immediate pull) and by the recurring scheduler (scheduler.ts).
 */
import { Billing } from "@/models/billing.model";
import {
  PlatformConnection,
  type PlatformConnectionDocument,
} from "@/models/platform-connection.model";
import { emitBusinessDataChanged } from "@/services/events/event-bus";
import { isEmailSyncPlatform } from "@/services/email-sync/registry";
import { listCandidateMessageIds, getMessage } from "@/services/email-sync/gmail-client";
import { extractPlainText, parseInvoiceFields, parseSender } from "@/services/email-sync/parser";

const MAX_MESSAGES_PER_RUN = 200;
const PAGE_SIZE = 50;
const FIRST_SYNC_LOOKBACK_DAYS = 90;
const OVERLAP_DAYS = 1;

interface EmailSyncState {
  lastSyncedAt?: string;
}
interface AccountMetadata {
  pipedreamAccountId?: string;
  emailSync?: EmailSyncState;
}

/**
 * Syncs one Gmail connection. Silently does nothing if the platform isn't a
 * supported email-sync source or has no Pipedream account id yet. Never throws.
 */
export async function syncConnectionEmail(
  connection: PlatformConnectionDocument
): Promise<void> {
  if (!isEmailSyncPlatform(connection.platform)) return;

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
  const query = buildInvoiceSearchQuery(sinceDate);

  let processed = 0;
  let created = 0;
  let hitCap = false;
  let pageToken: string | undefined;

  try {
    do {
      const page = await listCandidateMessageIds(
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
          const wasCreated = await processOneMessage(
            connection,
            externalUserId,
            pipedreamAccountId,
            messageId
          );
          if (wasCreated) created++;
        } catch {
          // One bad/unreachable message must never abort the whole run.
        }
      }
      pageToken = hitCap ? undefined : page.nextPageToken;
    } while (pageToken);

    // Only advance the watermark when the search window was fully drained —
    // if the safety cap was hit, leave it unchanged so the next run resumes
    // the same backlog instead of silently skipping whatever didn't fit.
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

async function processOneMessage(
  connection: PlatformConnectionDocument,
  externalUserId: string,
  pipedreamAccountId: string,
  messageId: string
): Promise<boolean> {
  const message = await getMessage(externalUserId, pipedreamAccountId, messageId);
  if (!message) return false;

  const headers = message.payload?.headers ?? [];
  const fromHeader = headers.find((h) => h.name.toLowerCase() === "from")?.value;
  const receivedAt = message.internalDate ? new Date(Number(message.internalDate)) : new Date();

  const text = extractPlainText(message);
  const fields = parseInvoiceFields(text, receivedAt);
  // Billing.amount and .currency are required — guessing either wrong is worse
  // than skipping this message, so both must be confidently parsed.
  if (fields.amount === null || fields.currency === null) return false;

  const { displayName, domain } = parseSender(fromHeader);
  const vendorSlug =
    (domain ?? "unknown")
      .replace(/\.(com|net|org|io|co)$/i, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase() || "unknown";
  const customerName =
    displayName ??
    (vendorSlug !== "unknown" ? vendorSlug[0].toUpperCase() + vendorSlug.slice(1) : "Email invoice");
  const invoiceNumber = fields.invoiceNumber ?? `EMAIL-${messageId.slice(0, 10).toUpperCase()}`;

  // Prefer a semantic dedupe key (vendor + invoice number) over the raw message
  // id: an initial "your invoice" email and a later "payment received" receipt
  // for the SAME invoice then update ONE record's status instead of creating
  // two disconnected rows. Namespaced by vendor domain to avoid cross-vendor
  // invoice-number collisions.
  const externalId = fields.invoiceNumber
    ? `gmail-inv-${vendorSlug}-${fields.invoiceNumber.replace(/[^A-Za-z0-9-]/g, "").toLowerCase()}`
    : `gmail-msg-${messageId}`;

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
        notes: "Parsed from a Gmail message (fallback email sync).",
      },
    },
    { upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  return !existedBefore;
}

function buildInvoiceSearchQuery(sinceDate: Date | null): string {
  const keywords = [
    "invoice",
    "receipt",
    '"payment receipt"',
    '"payment confirmation"',
    '"billing statement"',
    '"your invoice"',
    '"amount due"',
    '"payment received"',
    "statement",
  ];
  const noise = "-category:promotions -category:social -category:forums -in:spam -in:trash";
  const window = sinceDate
    ? `after:${formatGmailDate(sinceDate)}`
    : `newer_than:${FIRST_SYNC_LOOKBACK_DAYS}d`;
  return `(${keywords.join(" OR ")}) ${noise} ${window}`;
}

function formatGmailDate(d: Date): string {
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}
