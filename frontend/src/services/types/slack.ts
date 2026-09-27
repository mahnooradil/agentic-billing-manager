/** Response `data` shape for `POST /slack/link-code`. */
export interface SlackLinkCodeData {
  code: string;
  expiresInMinutes: number;
}

/** Response `data` shape for `GET /slack/status`. */
export interface SlackStatusData {
  connected: boolean;
  teamName: string | null;
}
