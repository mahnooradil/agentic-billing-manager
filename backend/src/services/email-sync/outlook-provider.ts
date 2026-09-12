/**
 * Outlook's EmailSyncProvider implementation. Unlike Gmail, Microsoft Graph's
 * `$search` on /me/messages CANNOT be combined with a `$filter` on
 * `receivedDateTime` (a 400 error) — so the search query itself carries only
 * keywords. Incremental "since last sync" is instead handled by the engine's
 * client-side early-stop: Graph returns message search results ordered
 * newest-first, so once a message older than `sinceDate` is seen, the run is
 * done (see `sortedNewestFirstUnfiltered` below).
 */
import type { EmailSyncProvider } from "@/services/email-sync/provider";
import { listCandidateMessageIds, getMessage } from "@/services/email-sync/outlook-client";
import { stripHtml } from "@/services/email-sync/parser";

// Graph's $search clause syntax: `"<property>:<text>"`, joined with OR/AND
// (operators outside the quotes, uppercase). Multi-word phrases are just the
// clause's text — KQL tokenizes them rather than requiring an exact phrase
// match. This keyword set is only used as a fallback when no senders are
// tracked yet; the AI extractor is what actually decides billing-relevance.
const SEARCH_CLAUSES = [
  '"body:invoice"',
  '"body:receipt"',
  '"subject:invoice"',
  '"subject:receipt"',
  '"body:payment receipt"',
  '"body:payment confirmation"',
  '"body:billing statement"',
  '"body:your invoice"',
  '"body:amount due"',
  '"body:payment received"',
  '"body:statement"',
];

function buildSearchQuery(_sinceDate: Date | null, trackedSenders: string[]): string {
  // Senders configured: scope to just those, AND still require an
  // invoice/receipt clause — see gmail-provider.ts's identical fix (a real
  // incident: dropping the keyword filter for tracked senders let a
  // domain's routine marketing/notification emails through too, and the AI
  // extractor misclassified several as billing emails in one run, creating
  // dozens of duplicate invoices and burning the workspace's credits).
  const keywords = `(${SEARCH_CLAUSES.join(" OR ")})`;
  if (trackedSenders.length > 0) {
    return `(${trackedSenders.map((s) => `"from:${s}"`).join(" OR ")}) AND ${keywords}`;
  }
  return keywords;
}

export const OUTLOOK_PROVIDER: EmailSyncProvider = {
  dedupePrefix: "outlook",
  notesText: "Parsed from an Outlook message (fallback email sync).",
  sortedNewestFirstUnfiltered: true,
  buildSearchQuery,
  listCandidateMessageIds,
  async getMessage(externalUserId, pipedreamAccountId, messageId) {
    const message = await getMessage(externalUserId, pipedreamAccountId, messageId);
    if (!message) return null;

    const body = message.body?.content ?? "";
    const plainText =
      message.body?.contentType?.toLowerCase() === "text" ? body : stripHtml(body);

    const sender = message.from?.emailAddress;
    const fromHeader = sender?.address
      ? sender.name
        ? `"${sender.name}" <${sender.address}>`
        : `<${sender.address}>`
      : null;

    // Defensive: a malformed `receivedDateTime` would silently produce an
    // Invalid Date (no error here) that can later crash a `.toISOString()`
    // call, or subtly break the oldest-to-newest sort in sync-engine.ts
    // (NaN comparisons never behave the way a real timestamp comparison
    // would) — falling back to "now" is a safe default instead.
    const parsedReceivedAt = message.receivedDateTime ? new Date(message.receivedDateTime) : null;
    const receivedAt =
      parsedReceivedAt && !Number.isNaN(parsedReceivedAt.getTime()) ? parsedReceivedAt : new Date();

    return {
      id: message.id,
      receivedAt,
      subject: message.subject ?? null,
      plainText,
      fromHeader,
    };
  },
};
