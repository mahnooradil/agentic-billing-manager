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
import {
  upsertNotification,
  getNotificationPrefs,
} from "@/services/notification/notification-engine";
import { sendSlackAlert } from "@/services/notifications/slack";

const MAX_MESSAGES_PER_RUN = 200;
const PAGE_SIZE = 50;
const OVERLAP_DAYS = 1;
/** How far back a Paid/Overdue confirmation (no real invoice number) may
 *  reach to resolve an existing open invoice's status, instead of creating a
 *  new row — generous enough for common NET-30-with-grace terms, bounded so
 *  it can never reopen/misattribute a much older, unrelated billing cycle. */
const OPEN_INVOICE_MATCH_WINDOW_MS = 45 * 86_400_000;

/** Escapes regex metacharacters so a value can be safely used inside a
 *  `$regex` filter (a fallback externalId's amount segment can contain a
 *  literal "." — regex-special — from a decimal amount). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface EmailSyncState {
  lastSyncedAt?: string;
}
interface AccountMetadata {
  pipedreamAccountId?: string;
  emailSync?: EmailSyncState;
}

/** Alerts the connection's owner once when a sync is skipped purely because
 *  the workspace is out of credits — otherwise this has no visible symptom
 *  besides invoices quietly never showing up. Respects the same notification
 *  preferences (master switch) as every other alert in the app. */
async function notifyEmailSyncPaused(connection: PlatformConnectionDocument): Promise<void> {
  const prefs = await getNotificationPrefs(connection.user.toString());
  if (!prefs.enabled) return;

  const { created } = await upsertNotification(connection.organization.toString(), {
    signature: "system:email-sync-paused-no-credits",
    category: "system",
    severity: "warning",
    title: "Email sync paused — out of credits",
    message:
      "Your workspace has run out of credits, so scanning your inbox for new invoices has paused. Add credits to resume.",
  });

  if (created && prefs.slackWebhookUrl) {
    await sendSlackAlert(
      prefs.slackWebhookUrl,
      ":warning: *Email sync paused* — your workspace is out of credits, so invoice scanning has stopped until you add more."
    ).catch(() => {
      // Best-effort — the in-app notification above is the source of truth.
    });
  }
}

// In-process guard against two overlapping runs for the SAME connection —
// this can genuinely happen: the scheduler's `setInterval` fires every hour
// regardless of whether the previous pass finished (a large backlog can take
// longer than that), and the "sync once on connect" trigger could also land
// mid-pass. Two concurrent runs each read the organization's credits balance
// independently and wouldn't see each other's deductions, so the balance
// could go further negative than either run's own safety check intended.
// Process-local only (fine for this app's current single-instance
// deployment) — would need a real distributed lock if ever run on more than
// one server.
const connectionsInProgress = new Set<string>();

export async function syncConnectionEmail(
  connection: PlatformConnectionDocument
): Promise<void> {
  const connectionId = connection._id.toString();
  if (connectionsInProgress.has(connectionId)) return;
  connectionsInProgress.add(connectionId);
  try {
    await syncConnectionEmailInner(connection);
  } finally {
    connectionsInProgress.delete(connectionId);
  }
}

async function syncConnectionEmailInner(
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
  if (!organization || organization.creditsBalance <= 0) {
    // Otherwise this fails completely silently — no error, no toast, nothing
    // in the UI — since a scheduled sync has no request/response to surface
    // one through. `upsertNotification` dedupes by (organization, signature),
    // so this only alerts once per organization until it's resolved (the
    // signature is reused, so it just refreshes quietly on every subsequent
    // paused run instead of re-notifying).
    if (organization) {
      void notifyEmailSyncPaused(connection).catch(() => {
        // Best-effort — a failed alert must never break/retry the sync itself.
      });
    }
    return;
  }

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
  // Counts messages that couldn't actually be checked (a real API/network
  // failure from the AI extractor, or an unexpected bug) — as opposed to a
  // message that WAS successfully checked and simply wasn't a bill. If
  // EVERY attempted message fails this way (e.g. an expired Anthropic key,
  // or Anthropic itself down), the run must not be allowed to advance the
  // watermark: that would silently mark a whole backlog "checked" when
  // nothing in it actually was, permanently hiding real invoices from every
  // future sync. A single isolated bad message among many successes is not
  // treated as systemic — it's skipped, same as before.
  let extractionErrors = 0;
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
    openInvoiceLookup: { externalIdPrefix: string } | null;
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
              openInvoiceLookup: extracted.fields.openInvoiceLookup,
            });
          }
        } catch {
          // One bad/unreachable message must never abort the whole run —
          // but it DOES mean this message was never actually checked, so
          // it counts toward `extractionErrors` (see that variable's
          // docstring) for the watermark decision below.
          extractionErrors++;
        }
      }
      pageToken = hitCap || stoppedEarly || outOfCredits ? undefined : page.nextPageToken;
    } while (pageToken);

    // Commit oldest-first: within one run, a later email for the same
    // invoice (e.g. a payment confirmation) is written last and wins.
    pendingUpdates.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    for (const update of pendingUpdates) {
      let dedupeQuery = update.dedupeQuery;

      // No real invoice number, and this email reports an outcome (Paid/
      // Overdue) rather than a fresh bill: a real incident showed the plain
      // day-keyed fallback only merges same-day emails about one bill — a
      // "payment received" arriving days after its own invoice, with no
      // shared date reference between the two, hashed to a DIFFERENT day key
      // and created a second row instead of resolving the first one's
      // status. Before falling back to a brand-new row, look for the most
      // recent still-open (non-Paid) record for this same vendor+amount and
      // resolve onto it instead — but only within a bounded window, so this
      // never reaches back and reopens/misattributes an old, unrelated cycle.
      if (update.openInvoiceLookup) {
        const openMatch = await Billing.findOne({
          organization: connection.organization,
          platformConnection: connection._id,
          externalId: {
            $regex: `^${escapeRegExp(update.openInvoiceLookup.externalIdPrefix)}`,
          },
          status: { $ne: "Paid" },
        })
          .sort({ billingDate: -1 })
          .select("externalId billingDate");

        if (
          openMatch &&
          Math.abs(openMatch.billingDate.getTime() - update.receivedAt.getTime()) <=
            OPEN_INVOICE_MATCH_WINDOW_MS
        ) {
          dedupeQuery = { ...dedupeQuery, externalId: openMatch.externalId };
        }
      }

      const existing = await Billing.findOne(dedupeQuery).select("manuallyEditedAt");

      // A human corrected this exact record (e.g. via the Billing page or
      // the Billing Advisor Agent's confirm button) more recently than this
      // email was even sent — re-reading that same old email must never
      // silently revert their correction back to whatever it said before.
      // A genuinely NEWER email (received after the correction) still wins,
      // since that reflects real new information.
      if (existing?.manuallyEditedAt && existing.manuallyEditedAt > update.receivedAt) {
        continue;
      }

      await Billing.findOneAndUpdate(
        dedupeQuery,
        { $set: update.setFields },
        { upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
      if (!existing) created++;
    }

    // Only advance the watermark when the search window was fully drained —
    // if the safety cap was hit, credits ran out mid-run, or every attempted
    // message failed to actually get checked (a systemic AI-extractor
    // failure, not a real "not a bill" verdict), leave it unchanged so the
    // next run resumes the same backlog instead of silently skipping
    // whatever didn't get through. Stopping early because the results ran
    // past `sinceDate` (Outlook) IS a fully-drained window, so it still
    // advances the watermark.
    const allAttemptsFailed = processed > 0 && extractionErrors === processed;
    if (!hitCap && !outOfCredits && !allAttemptsFailed) {
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

/** Placeholder strings the AI has been observed to return in place of a real
 *  value — technically non-empty/truthy, but carry no real information. */
const MEANINGLESS_VALUES = new Set([
  "unknown",
  "<unknown>",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "-",
  "tbd",
]);

/** Rejects a meaningless placeholder the same way a genuinely missing value
 *  would be rejected. Hit a real bug from skipping this: the AI sometimes
 *  returns the literal string "<UNKNOWN>" for `invoiceNumber` — a normal
 *  truthy-string check treated that as a real invoice number, so it took
 *  the "dedupe by real invoice number" branch instead of falling back to
 *  the day-based one, silently merging every email that got this same
 *  placeholder (regardless of actual vendor or date) into ONE Billing row. */
function meaningfulString(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || MEANINGLESS_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
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
  fields: {
    dedupeQuery: Record<string, unknown>;
    setFields: Record<string, unknown>;
    openInvoiceLookup: { externalIdPrefix: string } | null;
  } | null;
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
  const vendorNameFromAi = meaningfulString(fields.customerName);
  const invoiceNumberFromAi = meaningfulString(fields.invoiceNumber);
  const vendorName =
    vendorNameFromAi ??
    displayName ??
    (vendorSlug !== "unknown" ? vendorSlug[0].toUpperCase() + vendorSlug.slice(1) : "Email invoice");
  const invoiceNumber = invoiceNumberFromAi ?? `EMAIL-${message.id.slice(0, 10).toUpperCase()}`;
  const billingDate = parseAiDate(fields.billingDate) ?? message.receivedAt;
  const dueDate = parseAiDate(fields.dueDate);

  // Prefer a semantic dedupe key (vendor + invoice number) over the raw message
  // id: an initial "your invoice" email and a later "payment received" receipt
  // for the SAME invoice then update ONE record's status instead of creating
  // two disconnected rows. Namespaced by vendor domain to avoid cross-vendor
  // invoice-number collisions, and by provider to avoid cross-provider ones.
  //
  // When there's no invoice number at all, the fallback used to be keyed by
  // the raw message id — which seemed safe (one Billing row per email) but
  // broke badly in practice: a real inbox had dozens of separate, genuinely
  // distinct emails about what was really the SAME recurring charge (same
  // vendor, same amount, same day) with no invoice number in any of them —
  // each got its own row, and the AI cost of scanning them all emptied the
  // workspace's credits in one run. Keying by vendor + amount + day instead
  // collapses same-day repeats of the same charge into one record, the same
  // way a real invoice number would — while still keying by day so distinct
  // billing cycles (different days) each still get their own row.
  // Defensive: an Invalid Date here (a malformed provider timestamp that
  // slipped past the providers' own guards) would throw on `.toISOString()`
  // and abort this message — falling back to "now" is a far better outcome
  // than losing the whole message over an unparseable date.
  const billingDateKey = Number.isNaN(billingDate.getTime())
    ? new Date().toISOString().slice(0, 10)
    : billingDate.toISOString().slice(0, 10);
  const externalId = invoiceNumberFromAi
    ? `${provider.dedupePrefix}-inv-${vendorSlug}-${invoiceNumberFromAi.replace(/[^A-Za-z0-9-]/g, "").toLowerCase()}`
    : `${provider.dedupePrefix}-day-${vendorSlug}-${fields.amount}-${billingDateKey}`;

  const dedupeQuery = {
    organization: connection.organization,
    platformConnection: connection._id,
    externalId,
  };

  // No real invoice number, and this email is reporting a Paid/Overdue
  // OUTCOME rather than a fresh bill: the day-keyed externalId above only
  // catches same-day repeats, so hand the caller a vendor+amount prefix (day
  // segment stripped) it can use to find an already-open invoice from a
  // different day and resolve onto that instead of creating a new row — see
  // the commit loop's `openInvoiceLookup` handling in `syncConnectionEmail`.
  const openInvoiceLookup =
    !invoiceNumberFromAi && (fields.status === "Paid" || fields.status === "Overdue")
      ? { externalIdPrefix: `${provider.dedupePrefix}-day-${vendorSlug}-${fields.amount}-` }
      : null;

  return {
    fields: {
      dedupeQuery,
      openInvoiceLookup,
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
