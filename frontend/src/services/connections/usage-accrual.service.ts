import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { UsageAccrualListData } from "@/services/types/usage-accrual";

/** GET /usage-accruals — the latest usage/balance snapshot per connected
 *  platform (not a full historical ledger — see the backend controller's
 *  own docstring). */
export function listUsageAccruals(): Promise<ApiSuccess<UsageAccrualListData>> {
  return api.get<ApiSuccess<UsageAccrualListData>>("/usage-accruals");
}
