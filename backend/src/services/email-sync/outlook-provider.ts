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
// match, which is fine for this heuristic fallback parser.
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

function buildSearchQuery(): string {
  return `(${SEARCH_CLAUSES.join(" OR ")})`;
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

    return {
      id: message.id,
      receivedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : new Date(),
      plainText,
      fromHeader,
    };
  },
};
