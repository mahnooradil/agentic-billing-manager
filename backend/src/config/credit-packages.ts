/**
 * Fixed credit packages for the "Buy more credits" checkout flow (Stripe).
 * Credits per package are DERIVED from config/credits.ts's own
 * `CREDIT_USD_VALUE`, not invented separately — keeps this in step with the
 * rest of the app's credit economics instead of two independent numbers
 * someone has to remember to keep in sync.
 */
import { CREDIT_USD_VALUE } from "@/config/credits";

export const CREDIT_PACKAGES = [
  { id: "starter", priceUsd: 5 },
  { id: "growth", priceUsd: 10 },
  { id: "scale", priceUsd: 25 },
] as const;

export type CreditPackageId = (typeof CREDIT_PACKAGES)[number]["id"];

export function findCreditPackage(id: string) {
  return CREDIT_PACKAGES.find((p) => p.id === id);
}

/** Whole credits a package's USD price buys, at the app's standing rate. */
export function creditsForPackage(priceUsd: number): number {
  return Math.round(priceUsd / CREDIT_USD_VALUE);
}
