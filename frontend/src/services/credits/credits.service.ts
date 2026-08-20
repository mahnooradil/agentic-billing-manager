import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { CreditsData } from "@/services/types/credits";

/** GET /credits — the current user's credit balance + recent ledger history. */
export function getMyCredits(): Promise<ApiSuccess<CreditsData>> {
  return api.get<ApiSuccess<CreditsData>>("/credits");
}
