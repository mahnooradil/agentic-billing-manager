import { Request, Response, NextFunction } from "express";
import { Error as MongooseError } from "mongoose";
import { JsonWebTokenError } from "jsonwebtoken";
import { ZodError } from "zod";

import { isProduction } from "@/config/env";
import { AppError } from "@/utils/appError";
import type { ApiError } from "@/types";

/**
 * Central error-handling middleware.
 * Must be registered LAST, after all routes.
 *
 * Translates any thrown error into the standard error envelope
 * `{ success: false, message, errors? }` with an appropriate HTTP status.
 * Known operational errors (validation, duplicate key, bad token, `AppError`)
 * get precise codes; anything else is treated as a 500 and, in production,
 * its message is hidden to avoid leaking internal details.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const { statusCode, body } = normalizeError(err);

  // Only unexpected (5xx) errors are worth a full stack trace in the logs.
  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json(body);
}

/** Maps an unknown error to an HTTP status code and a response body. */
function normalizeError(err: unknown): { statusCode: number; body: ApiError } {
  // Explicit, application-thrown operational errors.
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: {
        success: false,
        message: err.message,
        ...(err.errors ? { errors: err.errors } : {}),
      },
    };
  }

  // WP-3 — a schema's own `.parse(req.query)` (the established pattern for
  // GET query-param validation: analytics/notification/recommendation/billing
  // controllers all call it directly, unlike the `validate` middleware's
  // `safeParse` for request bodies) throws a raw ZodError on failure. This
  // was previously unhandled here, so any bad query param on those endpoints
  // fell through to the 500 branch below instead of a proper 400 — fixed
  // once, centrally, rather than wrapping every call site in its own
  // safeParse/AppError boilerplate.
  if (err instanceof ZodError) {
    const errors = err.issues.map((issue) => {
      const field = issue.path.join(".");
      return field ? `${field}: ${issue.message}` : issue.message;
    });
    return {
      statusCode: 400,
      body: { success: false, message: "Validation failed", errors },
    };
  }

  // Mongoose schema validation failures (e.g. a direct model save).
  if (err instanceof MongooseError.ValidationError) {
    const errors = Object.values(err.errors).map((e) => e.message);
    return {
      statusCode: 400,
      body: { success: false, message: "Validation failed", errors },
    };
  }

  // Duplicate unique key (e.g. email already registered).
  if (isDuplicateKeyError(err)) {
    return {
      statusCode: 409,
      body: {
        success: false,
        message: "A record with these details already exists",
      },
    };
  }

  // Any JWT problem that escaped the auth middleware.
  if (err instanceof JsonWebTokenError) {
    return {
      statusCode: 401,
      body: { success: false, message: "Invalid or expired token" },
    };
  }

  // Fallback: unexpected error → 500, hide the message in production.
  const message = isProduction
    ? "Internal Server Error"
    : err instanceof Error
      ? err.message
      : String(err);

  return { statusCode: 500, body: { success: false, message } };
}

/** Detects MongoDB duplicate-key errors (code 11000) without a hard import. */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}
