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

/**
 * What this adapter's records actually represent (WP-4's domain-model
 * finding, audit census confirmed exactly: of 129 adapters, 124 hardcode
 * `status: "Pending"` forever and 122 stamp `billingDate` as the sync time
 * rather than a real billing date — they model month-to-date usage/balance,
 * not a discrete invoice. Only 5 (gocardless, heroku, mongodb, northflank,
 * snapchat-marketing) genuinely derive a status from the provider's own
 * data). `"invoice"` records still go to the `Billing` collection exactly
 * as before; `"usage_accrual"` records go to the new, separate
 * `UsageAccrual` collection instead — see billing-sync/sync-engine.ts.
 * This is a classification of the DATA SHAPE this specific provider
 * exposes, not a quality judgment on the adapter itself. */
export type BillingSyncRecordKind = "invoice" | "usage_accrual";

export interface BillingSyncAdapter {
  /** Must match the Pipedream catalog `nameSlug` for this platform. */
  platform: string;
  /** Human label for logs/UI. */
  label: string;
  /** See `BillingSyncRecordKind`'s own docstring. */
  kind: BillingSyncRecordKind;
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
