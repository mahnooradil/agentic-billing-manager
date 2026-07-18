/**
 * Wraps an async Express handler so any rejected promise is forwarded to the
 * central error handler via `next(err)` — removing repetitive try/catch blocks
 * from every controller and middleware.
 */
import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
