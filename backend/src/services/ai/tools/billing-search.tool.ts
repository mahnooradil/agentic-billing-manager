/**
 * Billing record search tool — lets the Billing Advisor Agent answer
 * questions about ONE specific invoice ("what's the status of invoice
 * #123?") instead of only aggregate figures. Also the lookup step for the
 * propose-only write tools (billing-actions.tool.ts): the agent searches
 * here first to get an exact `billingId`, then proposes a change against
 * that id — never against a fuzzy name match.
 */
import { Billing } from "@/models/billing.model";
import type { PlatformDocument } from "@/models/platform.model";
import type { PlatformConnectionDocument } from "@/models/platform-connection.model";
import { getOrganizationIdForUser } from "@/services/organizations/membership-lookup.service";
import type { AssistantTool } from "@/services/ai/tools/types";

const RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 20;

export interface BillingSearchRow {
  billingId: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  billingDate: string;
  dueDate?: string;
  platformName: string | null;
}

export interface BillingSearchResult {
  matchCount: number;
  records: BillingSearchRow[];
  /** True when `matchCount` was capped by the limit — more may exist. */
  truncated: boolean;
}

/** Escapes regex special characters so a free-text name search can't be
 *  used to inject an unintended pattern. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runBillingSearch(
  userId: string,
  input?: Record<string, unknown>
): Promise<BillingSearchResult> {
  const organizationId = await getOrganizationIdForUser(userId);
  if (!organizationId) return { matchCount: 0, records: [], truncated: false };

  const query: Record<string, unknown> = { organization: organizationId };

  const customerName = typeof input?.customerName === "string" ? input.customerName.trim() : "";
  if (customerName) query.customerName = new RegExp(escapeRegex(customerName), "i");

  const invoiceNumber = typeof input?.invoiceNumber === "string" ? input.invoiceNumber.trim() : "";
  if (invoiceNumber) query.invoiceNumber = new RegExp(escapeRegex(invoiceNumber), "i");

  const status = typeof input?.status === "string" ? input.status : "";
  if (status === "Pending" || status === "Paid" || status === "Overdue") query.status = status;

  const requestedLimit = typeof input?.limit === "number" ? input.limit : RESULT_LIMIT;
  const limit = Math.min(Math.max(1, Math.floor(requestedLimit)), MAX_RESULT_LIMIT);

  const [records, matchCount] = await Promise.all([
    Billing.find(query)
      .sort({ billingDate: -1 })
      .limit(limit)
      .populate("platformConnection", "displayName")
      .populate("platform", "name"),
    Billing.countDocuments(query),
  ]);

  return {
    matchCount,
    truncated: matchCount > limit,
    records: records.map((r) => {
      const platform = r.platform as unknown as PlatformDocument | null;
      const connection = r.platformConnection as unknown as PlatformConnectionDocument | null;
      return {
        billingId: r._id.toString(),
        customerName: r.customerName,
        invoiceNumber: r.invoiceNumber,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        billingDate: r.billingDate.toISOString().slice(0, 10),
        dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : undefined,
        platformName: r.vendorName ?? connection?.displayName ?? platform?.name ?? null,
      };
    }),
  };
}

export const billingSearchTool: AssistantTool<BillingSearchResult> = {
  name: "search_billing_records",
  description:
    "Finds specific billing records by customer name, invoice number, and/or status (Pending/Paid/Overdue) — use this for questions about ONE particular invoice, or as the first step before proposing a status change or deletion (get the exact billingId here first). Returns up to `limit` (default 10, max 20) matches, newest first.",
  run: runBillingSearch,
};
