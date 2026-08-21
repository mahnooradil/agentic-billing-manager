/**
 * Plain-text invoice field extraction — Node builtins only, no HTML/PDF parsing
 * library. Prefers the message's own `text/plain` MIME part; many real-world
 * invoice emails are HTML-only (no plain-text alternative), so falls back to a
 * lightweight tag-strip of the `text/html` part; falls back again to the
 * (already plain-text) `snippet` field if neither exists. This is a heuristic
 * v1 parser for a fallback channel, not a general-purpose invoice OCR —
 * labeled patterns ("Total:", "Invoice #") are tried before bare/ambiguous
 * ones to minimize false positives from promotional emails that happen to
 * mention a dollar figure.
 */
import type { BillingStatus } from "@/models/billing.model";
import type { GmailMessage, GmailMessagePart } from "@/services/email-sync/gmail-client";

function walkForMimeType(part: GmailMessagePart | undefined, mimeType: string): string | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const child of part.parts ?? []) {
    const found = walkForMimeType(child, mimeType);
    if (found) return found;
  }
  return null;
}

const HTML_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** Strips tags/scripts/styles and decodes a handful of common entities — just
 *  enough to turn an HTML invoice email into scannable text, not a real parser.
 *  Exported for other providers (e.g. Outlook) whose message body already
 *  arrives as one HTML string rather than a MIME tree to walk. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => HTML_ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-effort plain text for a message — walks the MIME tree for `text/plain`,
 *  then an HTML part (tag-stripped), then falls back to Gmail's own snippet. */
export function extractPlainText(message: GmailMessage): string {
  const plain = walkForMimeType(message.payload, "text/plain");
  if (plain) return plain;
  const html = walkForMimeType(message.payload, "text/html");
  if (html) return stripHtml(html);
  return message.snippet ?? "";
}

const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  "¥": "JPY",
};
const KNOWN_CODES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "INR", "PKR", "OMR", "AED", "SAR",
  "JPY", "CHF", "SGD", "NZD",
];
const CURRENCY_TOKEN = "USD|EUR|GBP|CAD|AUD|INR|PKR|OMR|AED|SAR|JPY|CHF|SGD|NZD|\\$|€|£|₹|¥";

// Cents are optional ONLY when a "Total:"/"Amount Due:" label precedes the
// number — that context already confirms it's a real amount, so a whole-
// dollar figure like "$50" (no ".00") is safe to accept there. The BARE
// pattern below stays conservative (cents required) since it's the last-
// resort weak signal that must not fire on a promo email's "$50 off" mention.
const AMOUNT_LABELED_RE = new RegExp(
  `(?:total|amount\\s*due|grand\\s*total|balance\\s*due|amount\\s*paid|payment)\\s*[:\\-]?\\s*(${CURRENCY_TOKEN})?\\s*([\\d,]+(?:\\.\\d{2})?)`,
  "i"
);
const AMOUNT_BARE_RE = new RegExp(`(${CURRENCY_TOKEN})\\s?([\\d,]+\\.\\d{2})`);

// Global so callers can skip a false-positive match (e.g. "receipt from Acme"
// grabbing "from" as the token) and keep looking for the next label occurrence.
// Only full words ("invoice"/"receipt") are used as labels — a short "inv"
// alternative was tried and dropped: it collided with "INV" appearing INSIDE
// the invoice number itself (e.g. "INV-5001"), splitting off the prefix.
const INVOICE_NUMBER_LABEL_RE =
  /(?:invoice|receipt)\s*(?:#|no\.?|number|num)?\s*[:-]?\s*([A-Za-z0-9][A-Za-z0-9_/-]{2,20})/gi;

/** A real invoice/receipt number always contains at least one digit — plain
 *  words like "from" or "for" can match the loose token pattern above, so scan
 *  every label occurrence and take the first candidate that actually has one. */
function extractInvoiceNumber(text: string): string | null {
  for (const match of text.matchAll(INVOICE_NUMBER_LABEL_RE)) {
    const candidate = match[1];
    if (/\d/.test(candidate)) return candidate;
  }
  return null;
}

const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
const SLASH_DATE_RE = /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/;
const MONTH_NAME_DATE_RE =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i;

const PAID_RE =
  /\b(paid in full|payment received|thank you for your payment|receipt for your payment)\b/i;
const OVERDUE_RE = /\b(overdue|past due|payment failed|payment declined)\b/i;

export interface ExtractedFields {
  amount: number | null;
  currency: string | null;
  invoiceNumber: string | null;
  billingDate: Date;
  status: BillingStatus;
}

/** Extracts invoice fields from plain text. `receivedAt` is the fallback billing
 *  date when no date can be parsed from the body. */
export function parseInvoiceFields(text: string, receivedAt: Date): ExtractedFields {
  const amountMatch = AMOUNT_LABELED_RE.exec(text) ?? AMOUNT_BARE_RE.exec(text);
  const amount = amountMatch ? Number(amountMatch[2].replace(/,/g, "")) : null;
  const rawCurrency = amountMatch?.[1] ?? null;
  const currency = rawCurrency
    ? CURRENCY_SYMBOL_MAP[rawCurrency] ??
      (KNOWN_CODES.includes(rawCurrency.toUpperCase()) ? rawCurrency.toUpperCase() : null)
    : null;

  const invoiceNumber = extractInvoiceNumber(text);

  const iso = ISO_DATE_RE.exec(text)?.[1];
  const monthName = MONTH_NAME_DATE_RE.exec(text)?.[0];
  const slash = SLASH_DATE_RE.exec(text)?.[1];
  const parsedDate = iso
    ? new Date(iso)
    : monthName
      ? new Date(monthName)
      : slash
        ? new Date(slash)
        : null;
  const billingDate =
    parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : receivedAt;

  const status: BillingStatus = PAID_RE.test(text)
    ? "Paid"
    : OVERDUE_RE.test(text)
      ? "Overdue"
      : "Pending";

  return { amount, currency, invoiceNumber, billingDate, status };
}

/** Best-effort vendor display name + domain from a `From` header, used for
 *  `customerName` and to namespace the dedupe key — never a hard requirement. */
export function parseSender(
  fromHeader: string | undefined
): { displayName: string | null; domain: string | null } {
  if (!fromHeader) return { displayName: null, domain: null };
  const trimmed = fromHeader.trim();
  const nameMatch = /^"?([^"<]*)"?\s*<(.+)>$/.exec(trimmed);
  const displayNameRaw = nameMatch?.[1]?.trim() || null;
  const email = nameMatch?.[2] ?? trimmed;
  const domain = /@([^\s>]+)/.exec(email)?.[1]?.toLowerCase() ?? null;
  return {
    displayName: displayNameRaw && displayNameRaw.length > 1 ? displayNameRaw : null,
    domain,
  };
}
