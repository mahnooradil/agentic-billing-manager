/** WP-4's domain model — month-to-date usage/balance from a billing-sync
 *  adapter, distinct from a real invoice (see backend's usage-accrual.model.ts
 *  docstring for the full reasoning). Dates arrive as ISO strings over JSON. */
export interface UsageAccrualConnectionRef {
  id: string;
  displayName: string;
  platform: string;
}

export interface UsageAccrual {
  id: string;
  connection: UsageAccrualConnectionRef;
  amount: number;
  currency: string;
  snapshotAt: string;
  notes?: string;
}

export interface UsageAccrualListData {
  accruals: UsageAccrual[];
}
