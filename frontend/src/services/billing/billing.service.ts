/**
 * Billing service — typed wrappers over the backend CRUD endpoints. Every call
 * goes through the shared authenticated `api` client (Bearer token + central
 * 401 handling), so there is no duplicated fetch logic here.
 */
import { API_BASE_URL } from "@/services/api/config";
import { api, ApiError } from "@/services/api/client";
import { authStore } from "@/services/auth/auth-store";
import type { ApiSuccess } from "@/services/types/api";
import type {
  BillingData,
  BillingDeletedData,
  BillingListData,
  BillingStatsData,
  CreateBillingPayload,
  DuplicateCandidatesData,
  ImportBillingResult,
  UpdateBillingPayload,
} from "@/services/types/billing";

/** GET /billing */
export function listBillingRecords(): Promise<ApiSuccess<BillingListData>> {
  return api.get<ApiSuccess<BillingListData>>("/billing");
}

/** GET /billing/stats */
export function getBillingStats(): Promise<ApiSuccess<BillingStatsData>> {
  return api.get<ApiSuccess<BillingStatsData>>("/billing/stats");
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

/** GET /billing/duplicate-candidates — WP-5's "duplicate flags" (flow/08 §6). */
export function getDuplicateCandidates(): Promise<ApiSuccess<DuplicateCandidatesData>> {
  return api.get<ApiSuccess<DuplicateCandidatesData>>("/billing/duplicate-candidates");
}

/** POST /billing/:id/merge — confirms `duplicateId` is a duplicate of `id`.
 *  Non-destructive: nothing is deleted, see `unmergeBillingRecord`. */
export function mergeBillingRecords(
  id: string,
  duplicateId: string
): Promise<ApiSuccess<BillingData>> {
  return api.post<ApiSuccess<BillingData>>(`/billing/${id}/merge`, { duplicateId });
}

/** POST /billing/:id/unmerge — undoes a merge. */
export function unmergeBillingRecord(id: string): Promise<ApiSuccess<BillingData>> {
  return api.post<ApiSuccess<BillingData>>(`/billing/${id}/unmerge`);
}

/** POST /billing/:id/dismiss-duplicate — "these are NOT duplicates." */
export function dismissDuplicateCandidate(id: string): Promise<ApiSuccess<BillingData>> {
  return api.post<ApiSuccess<BillingData>>(`/billing/${id}/dismiss-duplicate`);
}

/**
 * GET /billing/export — downloads the caller's full billing history as a CSV
 * file. Not JSON, so this bypasses the shared `apiRequest` and drives the
 * browser's native download via a throwaway object URL.
 */
export async function exportBillingRecords(): Promise<void> {
  const token = authStore.getToken();
  const response = await fetch(`${API_BASE_URL}/billing/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new ApiError("Failed to export billing records.", response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `billing-records-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * POST /billing/import — bulk-creates billing records from a CSV file. Read
 * client-side via `File.text()` and posted as plain JSON (no multipart/file-
 * upload dependency needed for a small text payload like this).
 */
export async function importBillingRecords(file: File): Promise<ImportBillingResult> {
  const csv = await file.text();
  const response = await api.post<ApiSuccess<ImportBillingResult>>("/billing/import", {
    csv,
  });
  return response.data;
}
