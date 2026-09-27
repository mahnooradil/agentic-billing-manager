import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { CreditsData } from "@/services/types/credits";

/** GET /credits — the current user's credit balance + recent ledger history. */
export function getMyCredits(): Promise<ApiSuccess<CreditsData>> {
  return api.get<ApiSuccess<CreditsData>>("/credits");
}

/** POST /credits/checkout — starts a Stripe Checkout session for a credit
 *  package; the response's `url` is Stripe's own hosted checkout page. */
export function createCreditsCheckoutSession(
  packageId: string
): Promise<ApiSuccess<{ url: string }>> {
  return api.post<ApiSuccess<{ url: string }>>("/credits/checkout", { packageId });
}
