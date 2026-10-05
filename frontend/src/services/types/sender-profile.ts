/**
 * Sender trust types — WP-11's learning loop (flow/04 §7). Dates arrive as
 * ISO strings over JSON.
 */
export type SenderTrust = "neutral" | "trusted" | "suppressed";

export interface SenderProfile {
  id: string;
  domain: string;
  trust: SenderTrust;
  confirmedInvoiceCount: number;
  falsePositiveCount: number;
  manuallySet: boolean;
  lastEvaluatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SenderProfileListData {
  profiles: SenderProfile[];
}

export interface SenderProfileData {
  profile: SenderProfile;
}
