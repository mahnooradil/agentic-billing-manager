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
import type { VendorDocument } from "@/models/vendor.model";
import type { AssistantTool } from "@/services/ai/tools/types";
// Registered for side effects only — this file's own `.populate()` calls
// below need these models registered with Mongoose even when this module is
// imported in isolation (e.g. a standalone test run that never otherwise
// loads a controller that pulls them in first).
import "@/models/platform.model";
import "@/models/platform-connection.model";
import "@/models/vendor.model";

const RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 20;

/** `Billing.customerName` means three different things depending on
 *  `source` — a real, human-entered counterparty for `manual` records, but
 *  the connected platform's own display name for `auto_sync`, or (worse)
 *  the WORKSPACE'S OWN organization name, identical on every row, for
 *  `email_sync`. A live incident: asking to "find the Netflix invoice"
 *  failed for an email_sync record because its `customerName` was the
 *  workspace's name, not "Netflix" — the real vendor was only ever in
 *  `vendorName`. This note (and the `vendor` field below) exists so the
 *  model doesn't have to already know that convention to search or answer
 *  correctly — mirrors `platforms.tool.ts`'s proven `DISAMBIGUATION_NOTE`. */
const DISAMBIGUATION_NOTE =
  "'customerName' is only a real customer/counterparty for manually-entered records. For connected/synced records (source auto_sync or email_sync) it may instead be the platform's own name or this workspace's own organization name — it is NOT a reliable 'who is this bill from' answer for those. Use 'vendor' (same value as 'platformName') for 'who sent/is this bill from' instead. This search already matches vendor names too (not just customerName), so searching by a vendor/brand name like 'Netflix' works directly.";

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
  /** Same value as `platformName`, under a name that reads unambiguously as
   *  "who sent this bill" — see `DISAMBIGUATION_NOTE`. Kept alongside
   *  `platformName` rather than replacing it (additive, not a rename). */
  vendor: string | null;
}

export interface BillingSearchResult {
  matchCount: number;
  records: BillingSearchRow[];
  /** True when `matchCount` was capped by the limit — more may exist. */
  truncated: boolean;
  /** Embedded directly in the tool result — see `platforms.tool.ts`'s
   *  identical pattern, added after the team observed the model getting a
   *  similar field ambiguity wrong live. */
  note: string;
}

/** Escapes regex special characters so a free-text name search can't be
 *  used to inject an unintended pattern. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function runBillingSearch(
  organizationId: string,
  input?: Record<string, unknown>
): Promise<BillingSearchResult> {
  const query: Record<string, unknown> = { organization: organizationId };

  // Matched against customerName, vendorName, AND vendorDomain — see
  // DISAMBIGUATION_NOTE: a vendor/brand name like "Netflix" only ever lives
  // in `vendorName` for auto_sync/email_sync records, never in
  // `customerName`, so searching customerName alone silently misses the
  // exact case a user is most likely to ask for. `vendorDomain` (Task 7's
  // real Vendor identity, e.g. "netflix.com") is included too so a query
  // that happens to match the domain but not the display name — or a
  // legacy record whose display name drifted from the vendor's own
  // branding — still resolves. Deliberately still exposed under the
  // existing `customerName` parameter rather than a new named one: this
  // tool's actual input schema is registered in the Anthropic Console, not
  // this file (see services/ai/tools/index.ts) — widening what an existing
  // parameter matches needs no Console change, but a genuinely new
  // parameter name would need one.
  const customerName = typeof input?.customerName === "string" ? input.customerName.trim() : "";
  if (customerName) {
    const re = new RegExp(escapeRegex(customerName), "i");
    query.$or = [{ customerName: re }, { vendorName: re }, { vendorDomain: re }];
  }

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
      .populate("platform", "name")
      .populate("vendor", "name domain"),
    Billing.countDocuments(query),
  ]);

  return {
    matchCount,
    truncated: matchCount > limit,
    note: DISAMBIGUATION_NOTE,
    records: records.map((r) => {
      const platform = r.platform as unknown as PlatformDocument | null;
      const connection = r.platformConnection as unknown as PlatformConnectionDocument | null;
      const vendorDoc = r.vendor as unknown as VendorDocument | null;
      // Prefer the resolved Vendor's name (Task 7) — the canonical, self-
      // correcting identity shared across every connection for this same
      // real vendor — falling back to the older per-record strings for a
      // record not yet covered by the vendor backfill.
      const vendor = vendorDoc?.name ?? r.vendorName ?? connection?.displayName ?? platform?.name ?? null;
      return {
        billingId: r._id.toString(),
        customerName: r.customerName,
        invoiceNumber: r.invoiceNumber,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        billingDate: r.billingDate.toISOString().slice(0, 10),
        dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : undefined,
        platformName: vendor,
        vendor,
      };
    }),
  };
}

export const billingSearchTool: AssistantTool<BillingSearchResult> = {
  name: "search_billing_records",
  description:
    "Finds specific billing records by customer/vendor name (the `customerName` parameter also matches the vendor/platform a bill is FROM, e.g. 'Netflix'), invoice number, and/or status (Pending/Paid/Overdue) — use this for questions about ONE particular invoice, or as the first step before proposing a status change or deletion (get the exact billingId here first). Each result includes a `vendor` field (who sent this bill) and a `note` explaining why `customerName` alone can be misleading for connected/synced records — read the note before stating who a bill is from/to. Returns up to `limit` (default 10, max 20) matches, newest first.",
  run: runBillingSearch,
};
