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

/** Best-effort vendor display name + email + domain from a `From` header, used
 *  for `customerName`, the dedupe key namespace, and (email) the record's
 *  provenance trail — never a hard requirement. */
export function parseSender(
  fromHeader: string | undefined
): { displayName: string | null; email: string | null; domain: string | null } {
  if (!fromHeader) return { displayName: null, email: null, domain: null };
  const trimmed = fromHeader.trim();
  const nameMatch = /^"?([^"<]*)"?\s*<(.+)>$/.exec(trimmed);
  const displayNameRaw = nameMatch?.[1]?.trim() || null;
  const email = nameMatch?.[2] ?? trimmed;
  const domain = /@([^\s>]+)/.exec(email)?.[1]?.toLowerCase() ?? null;
  return {
    displayName: displayNameRaw && displayNameRaw.length > 1 ? displayNameRaw : null,
    email: email.includes("@") ? email.toLowerCase() : null,
    domain,
  };
}

/** One authentication mechanism's verdict, normalized down to the three
 *  values that actually matter for a trust decision — the receiving mail
 *  server's raw `Authentication-Results` header uses many more (softfail,
 *  neutral, temperror, ...), all folded into "none" here since none of them
 *  are an affirmative pass. */
export type AuthVerdict = "pass" | "fail" | "none";

export interface SenderAuthResults {
  spf: AuthVerdict;
  dkim: AuthVerdict;
  dmarc: AuthVerdict;
}

/** Parses the receiving mail server's own `Authentication-Results` header
 *  (Task 9, S-08) — this is the actual answer to "was this From: address
 *  spoofed," verified by the mail server that received the message, not
 *  something derivable from the message body/headers a sender fully
 *  controls. Absent/unparseable → "none" for all three, treated the same
 *  as a real auth failure by the caller (no header at all is not evidence
 *  of legitimacy). */
export function parseAuthenticationResults(headerValue: string | null | undefined): SenderAuthResults {
  const verdictFor = (mechanism: "spf" | "dkim" | "dmarc"): AuthVerdict => {
    if (!headerValue) return "none";
    const match = new RegExp(`\\b${mechanism}=([a-z]+)`, "i").exec(headerValue);
    const value = match?.[1]?.toLowerCase();
    return value === "pass" || value === "fail" ? value : "none";
  };
  return { spf: verdictFor("spf"), dkim: verdictFor("dkim"), dmarc: verdictFor("dmarc") };
}

/** How much an extraction's own confidence drops when the sender looks
 *  suspicious (a failed DMARC check, or a Reply-To/From mismatch) — applied
 *  once regardless of how many suspicious signals fired (a flat penalty, not
 *  stacked), since either signal alone is already real evidence, not a
 *  fraction of it. */
const SUSPICIOUS_SENDER_CONFIDENCE_PENALTY = 0.4;

/** Combines an extraction's own confidence with sender-verification
 *  evidence (Task 9) — a DMARC failure or a Reply-To/From mismatch lowers
 *  confidence rather than rejecting the email outright, since a legitimate
 *  vendor can genuinely have DMARC misconfigured; this is a trust signal
 *  for the user/agent to weigh, not an automatic block. `null` in, `null`
 *  out — an extraction with no confidence value at all has nothing to
 *  adjust. */
export function applySenderTrustPenalty(
  confidence: number | null,
  authResults: SenderAuthResults,
  replyToMismatch: boolean
): number | null {
  if (confidence === null) return null;
  const suspicious = authResults.dmarc === "fail" || replyToMismatch;
  return suspicious ? Math.max(0, confidence - SUSPICIOUS_SENDER_CONFIDENCE_PENALTY) : confidence;
}

/** A `Reply-To` domain that differs from the `From` domain is a classic
 *  business-email-compromise pattern (the visible sender looks legitimate;
 *  replies — and often the actual conversation — go somewhere else
 *  entirely). Returns false when either header is missing/unparseable,
 *  since this signal only means something when both are actually present. */
export function hasReplyToMismatch(
  fromHeader: string | undefined,
  replyToHeader: string | undefined
): boolean {
  const fromDomain = parseSender(fromHeader).domain;
  const replyToDomain = parseSender(replyToHeader).domain;
  if (!fromDomain || !replyToDomain) return false;
  return fromDomain !== replyToDomain;
}
