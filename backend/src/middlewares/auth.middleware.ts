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
import { createPersonalOrganization } from "@/services/organizations/organization-bootstrap.service";

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

  // Session lookup and Membership lookup are independent of each other (both
  // only need user._id) — run them concurrently instead of one-after-another.
  // This halves the round trips this middleware adds to EVERY authenticated
  // request, which matters most when the app server and MongoDB Atlas aren't
  // in the same region (each round trip pays that network latency).
  //
  // A user can hold MULTIPLE memberships (their own workspace, plus any org
  // they were invited into) — `activeOrganizationId` says which one is
  // "current" for this request. Scoped by BOTH user and organization, so
  // this can never resolve to (let alone leak into) another user's org.
  const [session, membership] = await Promise.all([
    payload.jti ? Session.findOne({ user: user._id, jti: payload.jti }) : null,
    user.activeOrganizationId
      ? Membership.findOne({ user: user._id, organization: user.activeOrganizationId })
      : Membership.findOne({ user: user._id }).sort({ createdAt: 1 }),
  ]);

  // Tokens issued before session tracking existed carry no `jti` — skip the
  // per-device check for those rather than locking everyone out.
  if (payload.jti) {
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

  // Every authenticated route needs ONE organization to scope business data
  // to for this request — even though a user may belong to several. A user
  // can legitimately end up with no resolvable membership here (a stale
  // `activeOrganizationId` after being removed from that org, an orphaned
  // pre-backfill account, mid-signup race) — fall back to ANY membership
  // they actually still have before ever bootstrapping a brand-new personal
  // org, so switching back is never silently lost.
  let resolvedMembership = membership;
  let organization = resolvedMembership
    ? await Organization.findById(resolvedMembership.organization)
    : null;

  if ((!resolvedMembership || !organization) && user.activeOrganizationId) {
    resolvedMembership = await Membership.findOne({ user: user._id }).sort({ createdAt: 1 });
    organization = resolvedMembership
      ? await Organization.findById(resolvedMembership.organization)
      : null;
  }

  if (!resolvedMembership || !organization) {
    const bootstrapped = await createPersonalOrganization(user._id, user.fullName);
    resolvedMembership = bootstrapped.membership;
    organization = bootstrapped.organization;
  }

  // Persist a healed/first-resolved choice so the next request goes straight
  // to the org-scoped query above instead of repeating this fallback.
  if (!user.activeOrganizationId?.equals(resolvedMembership.organization)) {
    user.activeOrganizationId = resolvedMembership.organization;
    await user.save();
  }

  req.user = user;
  req.membership = resolvedMembership;
  req.organization = organization;
  next();
});
