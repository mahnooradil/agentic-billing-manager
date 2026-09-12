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

function buildSearchQuery(sinceDate: Date | null, trackedSenders: string[]): string {
  const window = sinceDate
    ? `after:${formatGmailDate(sinceDate)}`
    : `newer_than:${FIRST_SYNC_LOOKBACK_DAYS}d`;

  // Senders configured: scope to just those, AND still require an
  // invoice/receipt keyword. An earlier version dropped the keyword filter
  // entirely once a sender was tracked, reasoning that a handful of trusted
  // senders is low-volume enough to let the AI extractor alone tell promo
  // from billing content. In practice it didn't: a tracked "netflix.com"
  // pulled in every marketing/notification email from that domain too, and
  // the extractor misread several of them as billing emails in one run
  // (their footers mention the subscription price), producing dozens of
  // duplicate invoice rows for one real subscription and burning through
  // the workspace's credits. Keeping the keyword requirement even for
  // tracked senders cuts candidates down to what's actually invoice-shaped
  // before they ever reach the AI call — still catches wording variance the
  // AI is good at (e.g. "amount due" vs "your bill"), just not literally
  // everything a domain ever emails.
  //
  // The promotions/social/forums exclusion below only makes sense for the
  // broad, sender-less scan — it exists to cut inbox noise, not to second-
  // guess a domain the user already trusts. Gmail's own ML sometimes drops
  // a genuine transactional email (invoice, payment receipt) into the
  // Promotions tab a few minutes after delivery; excluding that category
  // once a sender is tracked would silently make such an email invisible
  // to every future sync, including the "payment received" follow-up that's
  // supposed to flip an existing record from Pending to Paid.
  const noise =
    trackedSenders.length > 0
      ? "-in:spam -in:trash"
      : "-category:promotions -category:social -category:forums -in:spam -in:trash";
  const keywords = `(${INVOICE_KEYWORDS.join(" OR ")})`;
  const subject =
    trackedSenders.length > 0
      ? `(${trackedSenders.map((s) => `from:${s}`).join(" OR ")}) ${keywords}`
      : keywords;

  return `${subject} ${noise} ${window}`;
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
    const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? null;
    // Defensive: a malformed/non-numeric `internalDate` would silently
    // produce an Invalid Date (no error here) that later crashes when
    // something calls `.toISOString()` on it — falling back to "now" is a
    // safe default rather than letting that happen further down the line.
    const parsedInternalDate = message.internalDate
      ? new Date(Number(message.internalDate))
      : null;
    const receivedAt =
      parsedInternalDate && !Number.isNaN(parsedInternalDate.getTime())
        ? parsedInternalDate
        : new Date();
    return {
      id: message.id,
      receivedAt,
      subject,
      plainText: extractPlainText(message),
      fromHeader,
    };
  },
};
