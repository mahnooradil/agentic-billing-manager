import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  CreateSupportRequestPayload,
  SupportRequestData,
  SupportRequestListData,
} from "@/services/types/support";

/** GET /support — the caller's own support requests, newest first. */
export function getSupportRequests(): Promise<ApiSuccess<SupportRequestListData>> {
  return api.get<ApiSuccess<SupportRequestListData>>("/support");
}

/** POST /support — submit a new support request. */
export function createSupportRequest(
  payload: CreateSupportRequestPayload
): Promise<ApiSuccess<SupportRequestData>> {
  return api.post<ApiSuccess<SupportRequestData>>("/support", payload);
}
