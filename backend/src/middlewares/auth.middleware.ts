/**
 * Authentication middleware.
 *
 * Responsibilities:
 *  1. Read the `Authorization: Bearer <token>` header.
 *  2. Verify the JWT signature and expiry.
 *  3. Load the user and attach it to `req.user`.
 *  4. Reject unauthorized requests with a 401 (no sensitive details leaked).
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { verifyToken } from "@/utils/jwt";
import { User } from "@/models/user.model";

const BEARER_PREFIX = "Bearer ";

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw new AppError("Authentication required", 401);
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    throw new AppError("Authentication required", 401);
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    // Collapse every verify failure into one opaque message — never reveal
    // whether the token was malformed, expired, or had a bad signature.
    throw new AppError("Invalid or expired token", 401);
  }

  const user = await User.findById(payload.id);
  if (!user) {
    throw new AppError("Invalid or expired token", 401);
  }

  req.user = user;
  next();
});
