/**
 * Billing-sync adapter contract (the "Adapter Layer" from docs/ARCHITECTURE.md).
 *
 * A billing-sync adapter knows how to turn ONE connected platform's own
 * billing/usage API into our common billing shape. It never sees or stores raw
 * credentials — it reaches the platform's API only via the Pipedream Connect
 * proxy (`connectProxyRequest`), keyed by the connection's Pipedream account id.
 */
import type { BillingStatus } from "@/models/billing.model";

/** One normalized charge, ready to upsert into the Billing collection. */
export interface NormalizedBillingRecord {
  /** The source API's own identifier for this charge/period — the upsert key. */
  externalId: string;
  amount: number;
  currency: string;
  billingDate: Date;
  status: BillingStatus;
  /** Short note on where this number came from (e.g. "Auto-synced from BunnyCDN"). */
  notes?: string;
}

export interface BillingSyncAdapter {
  /** Must match the Pipedream catalog `nameSlug` for this platform. */
  platform: string;
  /** Human label for logs/UI. */
  label: string;
  /**
   * Fetches this connection's current billing data via the Pipedream proxy.
   * `pipedreamAccountId` is the connected account to act on behalf of;
   * `externalUserId` is this app's user id (Pipedream's `external_user_id`).
   */
  fetchRecords(
    externalUserId: string,
    pipedreamAccountId: string
  ): Promise<NormalizedBillingRecord[]>;
}
