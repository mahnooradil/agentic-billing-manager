/**
 * Shared-secret verification for inbound webhooks (Phase 8C).
 *
 * The caller (Pipedream) is not a logged-in user, so JWT auth does not apply.
 * Instead requests must present the configured secret in the `X-Webhook-Token`
 * header. Comparison is constant-time; the endpoint fails CLOSED when no secret
 * is configured. Errors are generic and never reveal or log the secret.
 */
import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

import { env } from "@/config/env";
import { AppError } from "@/utils/appError";

const WEBHOOK_HEADER = "X-Webhook-Token";

/** Constant-time string compare; false (without timing leak) on length mismatch. */
function safeEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function verifyWebhookSecret(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const configured = env.pipedreamWebhookSecret;

  // Fail closed: never accept a webhook when the secret is not configured.
  if (!configured) {
    next(new AppError("Invalid webhook credentials", 401));
    return;
  }

  const provided = req.header(WEBHOOK_HEADER) ?? "";
  if (!provided || !safeEqual(provided, configured)) {
    next(new AppError("Invalid webhook credentials", 401));
    return;
  }

  next();
}
