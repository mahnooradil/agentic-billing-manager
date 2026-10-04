/**
 * The one place that appends an `AuditLog` entry — used by
 * billing.controller.ts's create/update/delete handlers. Best-effort: a
 * failure to record the audit trail must never fail the actual mutation the
 * caller already performed (same principle `billing-event-recorder.service.ts`
 * already applies to its own best-effort writes).
 */
import type { Types } from "mongoose";

import { AuditLog, type AuditLogAction, type AuditLogEntityType } from "@/models/audit-log.model";

export interface RecordAuditLogInput {
  organization: Types.ObjectId;
  user: Types.ObjectId;
  action: AuditLogAction;
  entityType: AuditLogEntityType;
  entityId: Types.ObjectId;
  summary: string;
}

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  await AuditLog.create(input).catch(() => {
    // Best-effort — see the file's own docstring.
  });
}

/** Builds the audit summary for one Billing record — the same shape used
 *  for create/update/delete so the log reads consistently. */
export function billingAuditSummary(record: {
  invoiceNumber: string;
  customerName: string;
  amount: number;
  currency: string;
}): string {
  return `${record.invoiceNumber} (${record.customerName}, ${record.amount} ${record.currency})`;
}
