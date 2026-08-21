/**
 * Thin Microsoft Graph (Outlook mail) wrapper over the Pipedream Connect proxy —
 * mirrors gmail-client.ts's shape. Outlook was connected through the SAME
 * generic Pipedream-managed OAuth flow as every other platform (the
 * `microsoft_outlook` app); Pipedream vaults the Microsoft OAuth token, this
 * app never sees it. Calls go through `connectProxyRequest`, which injects
 * that token and proxies the request to Graph's own API.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0/me";

export interface OutlookMessage {
  id: string;
  receivedDateTime?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
}

export interface OutlookListPage {
  messageIds: string[];
  /** The full `@odata.nextLink` URL — opaque to the caller, just like Gmail's pageToken. */
  nextPageToken?: string;
}

interface RawListResponse {
  value?: { id?: string }[];
  "@odata.nextLink"?: string;
}

/**
 * Lists message ids matching a KQL `$search` query (see
 * services/email-sync/outlook-provider.ts for how the query is built).
 * `$search` on /me/messages doesn't support `$skip` — paging beyond the first
 * page relies entirely on the opaque `@odata.nextLink` Graph returns.
 */
export async function listCandidateMessageIds(
  externalUserId: string,
  pipedreamAccountId: string,
  query: string,
  maxResults: number,
  pageToken?: string
): Promise<OutlookListPage> {
  const url =
    pageToken ??
    `${GRAPH_API_BASE}/messages?${new URLSearchParams({
      $search: query,
      $top: String(maxResults),
      $select: "id",
    }).toString()}`;

  const data = (await connectProxyRequest(
    externalUserId,
    pipedreamAccountId,
    url
  )) as RawListResponse | null;

  return {
    messageIds: (data?.value ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id)),
    nextPageToken: data?.["@odata.nextLink"],
  };
}

/** Fetches one message's subject/body/sender/received date. Null on any
 *  failure — one unreachable message must never abort the whole sync run. */
export async function getMessage(
  externalUserId: string,
  pipedreamAccountId: string,
  messageId: string
): Promise<OutlookMessage | null> {
  try {
    const params = new URLSearchParams({
      $select: "subject,body,from,receivedDateTime",
    });
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `${GRAPH_API_BASE}/messages/${encodeURIComponent(messageId)}?${params.toString()}`
    )) as OutlookMessage | null;
    return data?.id ? data : null;
  } catch {
    return null;
  }
}
