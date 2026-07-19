/**
 * Billing service — typed wrappers over the backend CRUD endpoints. Every call
 * goes through the shared authenticated `api` client (Bearer token + central
 * 401 handling), so there is no duplicated fetch logic here.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  BillingData,
  BillingDeletedData,
  BillingListData,
  CreateBillingPayload,
  UpdateBillingPayload,
} from "@/services/types/billing";

/** GET /billing */
export function listBillingRecords(): Promise<ApiSuccess<BillingListData>> {
  return api.get<ApiSuccess<BillingListData>>("/billing");
}

/** GET /billing/:id */
export function getBillingRecord(id: string): Promise<ApiSuccess<BillingData>> {
  return api.get<ApiSuccess<BillingData>>(`/billing/${id}`);
}

/** POST /billing */
export function createBillingRecord(
  payload: CreateBillingPayload
): Promise<ApiSuccess<BillingData>> {
  return api.post<ApiSuccess<BillingData>>("/billing", payload);
}

/** PUT /billing/:id */
export function updateBillingRecord(
  id: string,
  payload: UpdateBillingPayload
): Promise<ApiSuccess<BillingData>> {
  return api.put<ApiSuccess<BillingData>>(`/billing/${id}`, payload);
}

/** DELETE /billing/:id */
export function deleteBillingRecord(
  id: string
): Promise<ApiSuccess<BillingDeletedData>> {
  return api.delete<ApiSuccess<BillingDeletedData>>(`/billing/${id}`);
}
