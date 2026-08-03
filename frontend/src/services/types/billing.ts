/**
 * Billing domain types shared between the service layer and the UI.
 * Dates arrive as ISO strings over JSON.
 */
export type BillingStatus = "Pending" | "Paid" | "Overdue";

/** Minimal platform reference embedded in a billing record. */
export interface BillingPlatformRef {
  id: string;
  name: string;
  slug: string;
}

export interface BillingRecord {
  id: string;
  platform: BillingPlatformRef;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  billingDate: string;
  status: BillingStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Request payload for creating a billing record. */
export interface CreateBillingPayload {
  platform: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  billingDate: string;
  status?: BillingStatus;
  notes?: string;
}

/** Request payload for updating a billing record (any subset). */
export type UpdateBillingPayload = Partial<CreateBillingPayload>;

/** Response `data` shapes returned by the billing endpoints. */
export interface BillingListData {
  billingRecords: BillingRecord[];
}

export interface BillingData {
  billingRecord: BillingRecord;
}

export interface BillingDeletedData {
  id: string;
}

/** Aggregate billing statistics for the billing dashboard. */
export interface BillingStats {
  totalRecords: number;
  paidRecords: number;
  pendingRecords: number;
  overdueRecords: number;
  totalRevenue: number;
}

export interface BillingStatsData {
  stats: BillingStats;
}

/** Result of a CSV bulk-import — a per-row error list, capped server-side. */
export interface ImportBillingResult {
  imported: number;
  failed: number;
  errors: { row: number; message: string }[];
}
