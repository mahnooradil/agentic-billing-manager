import { Request, Response } from "express";

/**
 * Catches requests to unknown routes and returns a consistent 404 payload.
 * Registered after all valid routes, before the error handler.
 */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}
