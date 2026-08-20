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
import { Session } from "@/models/session.model";
import { Membership } from "@/models/membership.model";
import { Organization } from "@/models/organization.model";

const BEARER_PREFIX = "Bearer ";
/** Throttle for the `lastSeenAt` touch — avoids a write on every single request. */
const LAST_SEEN_THROTTLE_MS = 60_000;

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

  // A token signed before the user's last "sign out of all other devices"
  // carries a stale (or missing/0) tokenVersion — reject it the same generic
  // way as any other invalid token.
  if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
    throw new AppError("Invalid or expired token", 401);
  }

  // Tokens issued before session tracking existed carry no `jti` — skip the
  // per-device check for those rather than locking everyone out.
  if (payload.jti) {
    const session = await Session.findOne({ user: user._id, jti: payload.jti });
    if (!session || session.revokedAt) {
      throw new AppError("Invalid or expired token", 401);
    }
    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      void Session.updateOne(
        { _id: session._id },
        { $set: { lastSeenAt: new Date() } }
      ).catch(() => {
        // Best-effort — a missed activity touch never blocks the request.
      });
    }
    req.sessionJti = payload.jti;
  }

  // Every authenticated route needs the user's organization to scope business
  // data — v1 assumes exactly one Membership per user (see Membership model).
  // Missing here means either a pre-Organizations account that hasn't been
  // backfilled yet, or mid-signup — both are genuine 401s, not silently
  // proceeding with no organization scope.
  const membership = await Membership.findOne({ user: user._id });
  if (!membership) {
    throw new AppError("Your account has no organization set up.", 401);
  }
  const organization = await Organization.findById(membership.organization);
  if (!organization) {
    throw new AppError("Your account has no organization set up.", 401);
  }

  req.user = user;
  req.membership = membership;
  req.organization = organization;
  next();
});
