/**
 * Generic request-body validation middleware.
 *
 * Given a Zod schema, it parses `req.body`, replaces it with the parsed
 * (trimmed / normalized) result on success, or forwards a 400 `AppError`
 * carrying field-level messages to the central error handler on failure.
 */
import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

import { AppError } from "@/utils/appError";

export function validate<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => {
        const field = issue.path.join(".");
        return field ? `${field}: ${issue.message}` : issue.message;
      });
      next(new AppError("Validation failed", 400, errors));
      return;
    }

    req.body = result.data;
    next();
  };
}
