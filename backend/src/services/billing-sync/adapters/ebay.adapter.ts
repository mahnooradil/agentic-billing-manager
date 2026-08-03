/**
 * eBay billing adapter.
 *
 * `GET /sell/finances/v1/seller_funds_summary` (self-scoped, eBay's
 * official Finances API) returns the seller's own held funds per bucket
 * (available, processing, on hold), each broken down by currency. One
 * record per bucket per currency per day, upserted by `externalId`.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface EbayAmount {
  value?: string;
  currency?: string;
}

interface EbayFundsSummaryResponse {
  totalAvailableBalance?: EbayAmount;
  totalProcessingAmount?: EbayAmount;
  totalOnHoldBalance?: EbayAmount;
}

export const ebayBillingAdapter: BillingSyncAdapter = {
  platform: "ebay",
  label: "eBay",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const data = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://apiz.ebay.com/sell/finances/v1/seller_funds_summary"
    )) as EbayFundsSummaryResponse | null;

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    const buckets: { key: string; amount?: EbayAmount }[] = [
      { key: "available", amount: data?.totalAvailableBalance },
      { key: "processing", amount: data?.totalProcessingAmount },
      { key: "on_hold", amount: data?.totalOnHoldBalance },
    ];

    return buckets
      .map((b) => ({
        key: b.key,
        value: Number(b.amount?.value),
        currency: b.amount?.currency,
      }))
      .filter((b) => b.currency && Number.isFinite(b.value) && b.value > 0)
      .map((b) => ({
        externalId: `ebay-${day}-${b.key}-${b.currency}`,
        amount: b.value,
        currency: (b.currency as string).toUpperCase(),
        billingDate: now,
        status: "Pending" as const,
        notes: `Auto-synced from eBay — ${b.key.replace("_", " ")} seller funds.`,
      }));
  },
};
