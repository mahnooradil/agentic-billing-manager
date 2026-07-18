/**
 * Helper for emitting the standard success envelope:
 *   { success: true, message, data }
 *
 * Centralized so every controller returns an identical response shape.
 */
import { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  message: string,
  data: T
): void {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}
