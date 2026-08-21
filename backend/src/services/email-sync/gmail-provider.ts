/**
 * Gmail's EmailSyncProvider implementation — the search-query syntax and
 * message normalization live here; the raw REST calls stay in gmail-client.ts.
 */
import type { EmailSyncProvider } from "@/services/email-sync/provider";
import { listCandidateMessageIds, getMessage } from "@/services/email-sync/gmail-client";
import { extractPlainText } from "@/services/email-sync/parser";

const INVOICE_KEYWORDS = [
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
const FIRST_SYNC_LOOKBACK_DAYS = 90;

function formatGmailDate(d: Date): string {
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function buildSearchQuery(sinceDate: Date | null): string {
  const noise = "-category:promotions -category:social -category:forums -in:spam -in:trash";
  const window = sinceDate
    ? `after:${formatGmailDate(sinceDate)}`
    : `newer_than:${FIRST_SYNC_LOOKBACK_DAYS}d`;
  return `(${INVOICE_KEYWORDS.join(" OR ")}) ${noise} ${window}`;
}

export const GMAIL_PROVIDER: EmailSyncProvider = {
  dedupePrefix: "gmail",
  notesText: "Parsed from a Gmail message (fallback email sync).",
  // Gmail's `q=` query already narrows server-side by date — no client-side
  // early-stop needed (and its search results aren't reliably newest-first).
  sortedNewestFirstUnfiltered: false,
  buildSearchQuery,
  listCandidateMessageIds,
  async getMessage(externalUserId, pipedreamAccountId, messageId) {
    const message = await getMessage(externalUserId, pipedreamAccountId, messageId);
    if (!message) return null;
    const headers = message.payload?.headers ?? [];
    const fromHeader = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? null;
    const receivedAt = message.internalDate ? new Date(Number(message.internalDate)) : new Date();
    return {
      id: message.id,
      receivedAt,
      plainText: extractPlainText(message),
      fromHeader,
    };
  },
};
