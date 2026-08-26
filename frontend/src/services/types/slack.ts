/** Response `data` shape for `POST /slack/link-code`. */
export interface SlackLinkCodeData {
  code: string;
  expiresInMinutes: number;
}
