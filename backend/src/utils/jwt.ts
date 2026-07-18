/**
 * JWT utility — signing and verifying access tokens.
 *
 * The signing secret is read from the environment (never hardcoded) and its
 * presence is validated lazily here, so a misconfigured deploy fails with a
 * clear message the first time a token is issued or verified.
 */
import jwt, { SignOptions } from "jsonwebtoken";

import { env } from "@/config/env";
import type { TokenPayload } from "@/types";

/** Returns the configured secret or throws if it is missing. */
function getSecret(): string {
  if (!env.jwtSecret) {
    throw new Error(
      "JWT_SECRET is not defined. Set it in backend/.env (see .env.example)."
    );
  }
  return env.jwtSecret;
}

/** Signs a payload into a JWT that expires after `JWT_EXPIRES_IN`. */
export function generateToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, getSecret(), options);
}

/**
 * Verifies a token's signature and expiry, returning its payload.
 * Throws (JsonWebTokenError / TokenExpiredError) on any invalid token.
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret()) as TokenPayload;
}
