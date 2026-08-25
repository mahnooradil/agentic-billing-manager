/**
 * Email-sync provider abstraction — the piece registry.ts's docstring
 * anticipated when it said "a future channel can be added without
 * redesigning the call sites." sync-engine.ts's loop (pagination, safety
 * cap, watermark, dedupe/upsert) is IDENTICAL across providers; only how a
 * provider searches/fetches/normalizes one message differs, which is exactly
 * what this interface isolates.
 */
import { GMAIL_PROVIDER } from "@/services/email-sync/gmail-provider";
import { OUTLOOK_PROVIDER } from "@/services/email-sync/outlook-provider";

export interface EmailCandidatePage {
  messageIds: string[];
  nextPageToken?: string;
}

/** One email message reduced to exactly what the AI extractor + parser.ts's
 *  `parseSender` need, regardless of the provider's own wire shape (Gmail's
 *  base64 MIME tree vs Outlook's plain JSON body). */
export interface NormalizedEmailMessage {
  id: string;
  receivedAt: Date;
  subject: string | null;
  plainText: string;
  /** "Display Name <email@domain>" format — matches parser.parseSender's input. */
  fromHeader: string | null;
}

export interface EmailSyncProvider {
  /** Namespaces the Billing dedupe key (e.g. "gmail", "outlook"). */
  dedupePrefix: string;
  /** Human-readable source, used in the stored Billing record's `notes`. */
  notesText: string;
  /** True when `listCandidateMessageIds` is guaranteed to return newest-first
   *  AND the provider can't narrow its search by date server-side — lets the
   *  engine stop early once it walks past `sinceDate` instead of relying on
   *  a server-side date filter (Outlook's `$search` can't combine with a
   *  `$filter` on receivedDateTime; Gmail's `q=` already narrows by date). */
  sortedNewestFirstUnfiltered: boolean;
  /** `trackedSenders` (from PlatformConnection) scopes the search to those
   *  senders only — a privacy + accuracy win over scanning the whole inbox
   *  with generic keywords. Empty means "no senders configured yet," so the
   *  provider falls back to its original keyword-based query. */
  buildSearchQuery(sinceDate: Date | null, trackedSenders: string[]): string;
  listCandidateMessageIds(
    externalUserId: string,
    pipedreamAccountId: string,
    query: string,
    maxResults: number,
    pageToken?: string
  ): Promise<EmailCandidatePage>;
  getMessage(
    externalUserId: string,
    pipedreamAccountId: string,
    messageId: string
  ): Promise<NormalizedEmailMessage | null>;
}

/** Normalizes a Pipedream nameSlug the same way registry.ts does, so lookups
 *  here stay consistent with `isEmailSyncPlatform`. */
function normalize(slug: string): string {
  return slug.trim().toLowerCase().replace(/[-_]/g, "");
}

const PROVIDERS: Record<string, EmailSyncProvider> = {
  [normalize("gmail")]: GMAIL_PROVIDER,
  [normalize("microsoft_outlook")]: OUTLOOK_PROVIDER,
};

/** Resolves a connected platform's email-sync provider, or null if it isn't one. */
export function getEmailSyncProvider(platform: string): EmailSyncProvider | null {
  return PROVIDERS[normalize(platform)] ?? null;
}
