import { Request, Response, NextFunction } from "express";
import { isProduction } from "@/config/env";

/**
 * Central error-handling middleware.
 * Must be registered LAST, after all routes.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err);

  res.status(500).json({
    success: false,
    message: isProduction ? "Internal Server Error" : err.message,
  });
}
