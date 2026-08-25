/**
 * Email body extraction + sender parsing — Node builtins only, no HTML/PDF
 * parsing library. Prefers the message's own `text/plain` MIME part; many
 * real-world invoice emails are HTML-only (no plain-text alternative), so
 * falls back to a lightweight tag-strip of the `text/html` part; falls back
 * again to the (already plain-text) `snippet` field if neither exists.
 *
 * The actual invoice FIELD extraction (amount, currency, status, dates) used
 * to live here as a regex parser — replaced by ai-invoice-extractor.ts after
 * a live test showed it silently mis-marking paid invoices as "Pending" and
 * skipping many real invoices whose wording didn't match its fixed patterns.
 * This file now only turns a raw message into scannable text + sender info,
 * which the AI extractor still needs regardless of how billing fields get read.
 */
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
