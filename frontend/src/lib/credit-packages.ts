/**
 * Fixed credit packages for the "Buy more credits" dialog — mirrors backend
 * config/credit-packages.ts (same ids/prices/formula), the same way
 * DEFAULT_USER_SETTINGS mirrors its backend counterpart elsewhere in this
 * app. Display only: the backend independently re-validates `packageId` and
 * re-derives the real charge — this is never trusted for the actual price.
 */
const CREDIT_USD_VALUE = 0.02;

export interface CreditPackage {
  id: string;
  priceUsd: number;
  credits: number;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "starter", priceUsd: 5, credits: Math.round(5 / CREDIT_USD_VALUE) },
  { id: "growth", priceUsd: 10, credits: Math.round(10 / CREDIT_USD_VALUE) },
  { id: "scale", priceUsd: 25, credits: Math.round(25 / CREDIT_USD_VALUE) },
];
