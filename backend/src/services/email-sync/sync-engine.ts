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
 * watermark, dedupe/upsert) plus the AI extraction step every candidate
 * message goes through.
 *
 * Called from two places: right after an email-sync connection is created
 * (one immediate pull) and by the recurring scheduler (scheduler.ts).
 */
import { Billing } from "@/models/billing.model";
import { Organization } from "@/models/organization.model";
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
import { parseSender } from "@/services/email-sync/parser";
import {
  extractInvoiceFields,
  isAiExtractionConfigured,
} from "@/services/email-sync/ai-invoice-extractor";
import { consumeCredits } from "@/services/credits/credit-ledger.service";
import { tokensToCredits } from "@/config/credits";

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
 * isn't a supported email-sync source, has no Pipedream account id yet, the
 * AI extractor isn't configured, or the connection's WORKSPACE has no
 * credits left (same "pre-check blocks the next usage" rule the Billing
 * Advisor Agent uses — see utils/credits.ts; credits belong to the
 * organization, not the connecting member — see Organization model's
 * docstring). Never throws.
 */
export async function syncConnectionEmail(
  connection: PlatformConnectionDocument
): Promise<void> {
  const provider = getEmailSyncProvider(connection.platform);
  if (!provider) return;
  if (!isAiExtractionConfigured()) return;

  const meta = connection.metadata as AccountMetadata | undefined;
  const pipedreamAccountId = meta?.pipedreamAccountId;
  if (!pipedreamAccountId) return;

  // Reading each candidate email through the AI extractor costs the
  // workspace credits, exactly like a Billing Advisor Agent turn — so this
  // run never starts if it's already out (the next Agent message in this
  // workspace would be blocked the same way; the next successful sync just
  // resumes once it has credits again).
  const organization = await Organization.findById(connection.organization).select(
    "creditsBalance name"
  );
  if (!organization || organization.creditsBalance <= 0) return;

  const externalUserId = connection.user.toString();
  const runStartedAt = new Date();
  const sinceDate = meta?.emailSync?.lastSyncedAt
    ? new Date(
        new Date(meta.emailSync.lastSyncedAt).getTime() - OVERLAP_DAYS * 86_400_000
      )
    : null;
  const query = provider.buildSearchQuery(sinceDate, connection.trackedSenders ?? []);

  let processed = 0;
  let created = 0;
  let hitCap = false;
  let stoppedEarly = false;
  let outOfCredits = false;
  // Tracked locally (not re-read from the DB) so a run stops the moment its
  // OWN deductions exhaust the balance, instead of only being caught by the
  // next run's pre-check after already processing an entire backlog page.
  let remainingCredits = organization.creditsBalance;
  let pageToken: string | undefined;
  // Extraction happens in whatever order the provider's search returns
  // messages — NOT guaranteed to be chronological (Gmail explicitly isn't).
  // Writing to Billing immediately would let an older message (e.g. the
  // original "your invoice" email) overwrite a newer one (e.g. "payment
  // received") for the same invoice if it happens to be processed second.
  // So every extraction is staged here and only committed after this whole
  // fetch pass, sorted oldest-to-newest, so the chronologically last email
  // for a given invoice always wins the final DB write.
  const pendingUpdates: Array<{
    dedupeQuery: Record<string, unknown>;
    setFields: Record<string, unknown>;
    receivedAt: Date;
  }> = [];

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
        if (remainingCredits <= 0) {
          outOfCredits = true;
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

          const extracted = await extractCandidateFields(
            connection,
            provider,
            message,
            organization.name
          );
          remainingCredits -= extracted.creditsUsed;
          if (extracted.fields) {
            pendingUpdates.push({
              dedupeQuery: extracted.fields.dedupeQuery,
              setFields: extracted.fields.setFields,
              receivedAt: message.receivedAt,
            });
          }
        } catch {
          // One bad/unreachable message must never abort the whole run.
        }
      }
      pageToken = hitCap || stoppedEarly || outOfCredits ? undefined : page.nextPageToken;
    } while (pageToken);

    // Commit oldest-first: within one run, a later email for the same
    // invoice (e.g. a payment confirmation) is written last and wins.
    pendingUpdates.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    for (const update of pendingUpdates) {
      const existedBefore = await Billing.exists(update.dedupeQuery);
      await Billing.findOneAndUpdate(
        update.dedupeQuery,
        { $set: update.setFields },
        { upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
      if (!existedBefore) created++;
    }

    // Only advance the watermark when the search window was fully drained —
    // if the safety cap was hit (or credits ran out mid-run), leave it
    // unchanged so the next run resumes the same backlog instead of silently
    // skipping whatever didn't fit. Stopping early because the results ran
    // past `sinceDate` (Outlook) IS a fully-drained window, so it still
    // advances the watermark.
    if (!hitCap && !outOfCredits) {
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

/** Parses an AI-returned `YYYY-MM-DD` string; null/invalid → undefined
 *  (never a guessed date, since a wrong due/billing date is worse than none). */
function parseAiDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

/** Extracts one candidate message's billing fields and prices the AI call
 *  against the workspace's credits, but does NOT touch the Billing
 *  collection — the caller commits the write, in chronological order across
 *  the whole run (see the `pendingUpdates` sort in `syncConnectionEmail`),
 *  so a later status (e.g. a payment confirmation) is never clobbered by an
 *  earlier one processed out of order. */
async function extractCandidateFields(
  connection: PlatformConnectionDocument,
  provider: EmailSyncProvider,
  message: NormalizedEmailMessage,
  organizationName: string
): Promise<{
  fields: { dedupeQuery: Record<string, unknown>; setFields: Record<string, unknown> } | null;
  creditsUsed: number;
}> {
  const extraction = await extractInvoiceFields({
    subject: message.subject,
    fromHeader: message.fromHeader,
    bodyText: message.plainText,
  });

  // The API call itself costs tokens whether or not this turns out to be a
  // real invoice — deduct the same way a Billing Advisor Agent turn does,
  // regardless of the outcome below. Computed once so the caller can also
  // track the run's remaining balance without re-deriving it.
  const creditsUsed = tokensToCredits(extraction.inputTokens, extraction.outputTokens);
  void consumeCredits(
    connection.organization,
    creditsUsed,
    "email_invoice_extraction",
    connection.user
  );

  const fields = extraction.fields;
  // Not a real billing email (a promo that matched the search keywords), or
  // amount/currency couldn't be confidently read — guessing either wrong is
  // worse than skipping this message, so both must be present.
  if (!fields.isBillingEmail || fields.amount === null || fields.currency === null) {
    return { fields: null, creditsUsed };
  }

  const { displayName, domain } = parseSender(message.fromHeader ?? undefined);
  const vendorSlug =
    (domain ?? "unknown")
      .replace(/\.(com|net|org|io|co)$/i, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase() || "unknown";
  // The AI reads the email's own branding, so its vendor name is generally
  // more accurate than a domain-derived guess — prefer it when present. This
  // is who the bill is FROM (Netflix, Spotify, ...) — shown as "platform"
  // (see billing.serializer.ts), never confused with `customerName` below,
  // which is who the bill is TO (this workspace, not the vendor).
  const vendorName =
    fields.customerName ??
    displayName ??
    (vendorSlug !== "unknown" ? vendorSlug[0].toUpperCase() + vendorSlug.slice(1) : "Email invoice");
  const invoiceNumber =
    fields.invoiceNumber ?? `EMAIL-${message.id.slice(0, 10).toUpperCase()}`;
  const billingDate = parseAiDate(fields.billingDate) ?? message.receivedAt;
  const dueDate = parseAiDate(fields.dueDate);

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

  return {
    fields: {
      dedupeQuery,
      setFields: {
        organization: connection.organization,
        user: connection.user,
        platformConnection: connection._id,
        source: "email_sync",
        externalId,
        vendorName,
        customerName: organizationName,
        invoiceNumber,
        amount: fields.amount,
        currency: fields.currency,
        billingDate,
        ...(dueDate ? { dueDate } : {}),
        status: fields.status ?? "Pending",
        notes: provider.notesText,
      },
    },
    creditsUsed,
  };
}
