/**
 * Propose-only billing action tools. Neither tool here ever writes to the
 * database — each just verifies the target record exists (scoped to the
 * calling user's organization) and returns its details so
 * managed-agent.service.ts can surface a confirm button in the chat UI. The
 * ACTUAL update/delete only happens when the user clicks that button, which
 * calls the app's existing, already-authenticated `PUT/DELETE /api/billing/:id`
 * endpoints directly — the same ones the Billing page's own edit/delete UI
 * uses. This keeps a real financial-record mutation behind an explicit human
 * click, never an AI tool call alone.
 *
 * Always used AFTER `search_billing_records` (billing-search.tool.ts) has
 * already resolved the user's request to one exact `billingId` — these tools
 * intentionally take an id, not a fuzzy name, so there is no risk of acting
 * on the wrong record.
 */
import { Billing, BILLING_STATUSES, type BillingStatus } from "@/models/billing.model";
import { getOrganizationIdForUser } from "@/services/organizations/membership-lookup.service";

export interface ProposeUpdateStatusResult {
  found: boolean;
  billingId?: string;
  customerName?: string;
  invoiceNumber?: string;
  currentStatus?: string;
  proposedStatus?: BillingStatus;
  message: string;
}

export interface ProposeDeleteResult {
  found: boolean;
  billingId?: string;
  customerName?: string;
  invoiceNumber?: string;
  amount?: number;
  currency?: string;
  message: string;
}

/** Looks up one billing record by id, scoped to the calling user's
 *  organization — returns null if it doesn't exist or belongs to another
 *  organization (never leaks a not-found vs. wrong-org distinction). */
async function findOwnedBilling(userId: string, billingId: string) {
  const organizationId = await getOrganizationIdForUser(userId);
  if (!organizationId) return null;
  return Billing.findOne({ _id: billingId, organization: organizationId });
}

export async function runProposeUpdateBillingStatus(
  userId: string,
  input: Record<string, unknown>
): Promise<ProposeUpdateStatusResult> {
  const billingId = typeof input.billingId === "string" ? input.billingId : "";
  const newStatus = typeof input.newStatus === "string" ? input.newStatus : "";

  if (!BILLING_STATUSES.includes(newStatus as BillingStatus)) {
    return { found: false, message: `newStatus must be one of: ${BILLING_STATUSES.join(", ")}.` };
  }

  const record = await findOwnedBilling(userId, billingId).catch(() => null);
  if (!record) {
    return { found: false, message: "No billing record found with that id — search again first." };
  }

  if (record.status === newStatus) {
    return {
      found: true,
      billingId: record._id.toString(),
      customerName: record.customerName,
      invoiceNumber: record.invoiceNumber,
      currentStatus: record.status,
      proposedStatus: newStatus as BillingStatus,
      message: `Invoice ${record.invoiceNumber} is already ${newStatus} — nothing to change.`,
    };
  }

  return {
    found: true,
    billingId: record._id.toString(),
    customerName: record.customerName,
    invoiceNumber: record.invoiceNumber,
    currentStatus: record.status,
    proposedStatus: newStatus as BillingStatus,
    message: `Ready to mark invoice ${record.invoiceNumber} (${record.customerName}) as ${newStatus} — this has NOT been changed yet. Tell the user it's staged and waiting for their confirmation to actually apply it; never claim it's already done. Don't describe a specific UI element (e.g. "the button below") — this reply can be relayed somewhere with no button, like Slack, where the chat UI's own confirm control never renders.`,
  };
}

export async function runProposeDeleteBillingRecord(
  userId: string,
  input: Record<string, unknown>
): Promise<ProposeDeleteResult> {
  const billingId = typeof input.billingId === "string" ? input.billingId : "";

  const record = await findOwnedBilling(userId, billingId).catch(() => null);
  if (!record) {
    return { found: false, message: "No billing record found with that id — search again first." };
  }

  return {
    found: true,
    billingId: record._id.toString(),
    customerName: record.customerName,
    invoiceNumber: record.invoiceNumber,
    amount: record.amount,
    currency: record.currency,
    message: `Ready to delete invoice ${record.invoiceNumber} (${record.customerName}, ${record.amount} ${record.currency}) — this has NOT been deleted yet. Tell the user it's staged and waiting for their confirmation to actually apply it; never claim it's already done. Don't describe a specific UI element (e.g. "the button below") — this reply can be relayed somewhere with no button, like Slack, where the chat UI's own confirm control never renders. Deletion is permanent, so make sure the user actually asked for this exact invoice.`,
  };
}
