import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { PendingVendorsData, VendorData } from "@/services/types/vendor";

/** GET /vendors/pending — vendors awaiting the "confirm detected vendors" review. */
export function listPendingVendors(): Promise<ApiSuccess<PendingVendorsData>> {
  return api.get<ApiSuccess<PendingVendorsData>>("/vendors/pending");
}

/** POST /vendors/:id/confirm — "yes, this is a real vendor." */
export function confirmVendor(id: string): Promise<ApiSuccess<VendorData>> {
  return api.post<ApiSuccess<VendorData>>(`/vendors/${id}/confirm`);
}

/** POST /vendors/:id/reject — "not a real vendor" (an AI misread). */
export function rejectVendor(id: string): Promise<ApiSuccess<VendorData>> {
  return api.post<ApiSuccess<VendorData>>(`/vendors/${id}/reject`);
}
