/**
 * Thin Gmail REST wrapper over the Pipedream Connect proxy. Gmail was connected
 * through the SAME generic Pipedream-managed OAuth flow every other platform
 * uses (see platform-connection.controller.ts) — Pipedream vaults the Google
 * OAuth token, this app never sees it. Calls go through `connectProxyRequest`,
 * which injects that token and proxies the request to Gmail's own API.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  /** Epoch milliseconds as a string — always present. */
  internalDate?: string;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
}

export interface GmailListPage {
  messageIds: string[];
  nextPageToken?: string;
}

interface RawListResponse {
  messages?: { id?: string }[];
  nextPageToken?: string;
}

/** Lists message ids matching a Gmail search query (`q`, same syntax as the Gmail UI). */
export async function listCandidateMessageIds(
  externalUserId: string,
  pipedreamAccountId: string,
  query: string,
  maxResults: number,
  pageToken?: string
): Promise<GmailListPage> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  if (pageToken) params.set("pageToken", pageToken);

  const data = (await connectProxyRequest(
    externalUserId,
    pipedreamAccountId,
    `${GMAIL_API_BASE}/messages?${params.toString()}`
  )) as RawListResponse | null;

  return {
    messageIds: (data?.messages ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id)),
    nextPageToken: data?.nextPageToken,
  };
}

/** Fetches one message in full (headers + body parts). Null on any failure —
 *  one unreachable message must never abort the whole sync run. */
export async function getMessage(
  externalUserId: string,
  pipedreamAccountId: string,
  messageId: string
): Promise<GmailMessage | null> {
  try {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}?format=full`
    )) as GmailMessage | null;
    return data?.id ? data : null;
  } catch {
    return null;
  }
}
