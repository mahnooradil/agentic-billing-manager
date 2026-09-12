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
import { User, type UserDocument } from "@/models/user.model";
import { Session } from "@/models/session.model";
import { Membership, type MembershipDocument } from "@/models/membership.model";
import { Organization, type OrganizationDocument } from "@/models/organization.model";
import { createPersonalOrganization } from "@/services/organizations/organization-bootstrap.service";
import { getCachedAuth, setCachedAuth } from "@/middlewares/auth-cache";

const BEARER_PREFIX = "Bearer ";
/** Throttle for the `lastSeenAt` touch — avoids a write on every single request. */
const LAST_SEEN_THROTTLE_MS = 60_000;

/**
 * Resolves the ONE organization a given user's request should be scoped to
 * right now, self-healing `activeOrganizationId` when it's missing or stale.
 * Shared by `authenticate` (below) and any other entry point that starts
 * from an already-verified `User` document instead of a JWT — e.g. the
 * Slack chat handler, which identifies the user via a linked Slack id
 * rather than a Bearer token, but from there needs the exact same
 * "which workspace pays for this" resolution as the web UI.
 */
export async function resolveActiveOrganization(
  user: UserDocument,
  /** Pass the caller's own already-fetched membership (scoped the same way
   *  the lookup below would do it) to skip a redundant query — `authenticate`
   *  fetches this in parallel with its session lookup. Omit to have this
   *  function fetch it fresh (e.g. from the Slack chat handler). */
  knownMembership?: MembershipDocument | null,
  /** Same idea, for the organization itself: `authenticate` speculatively
   *  fetches `Organization.findById(user.activeOrganizationId)` in the SAME
   *  parallel batch as the session/membership lookup (a live measurement on
   *  this app's own MongoDB Atlas cluster found each round trip costs
   *  ~80-90ms — with 3-4 of these currently sequential per request, that's
   *  the majority of a request's total time; every trip moved into an
   *  existing parallel batch is a real, measured savings). Used only in the
   *  common case where it matches the membership actually resolved below —
   *  the fallback paths re-fetch when it doesn't, so a stale/wrong guess is
   *  never trusted. */
  knownOrganization?: OrganizationDocument | null
): Promise<{ membership: MembershipDocument; organization: OrganizationDocument }> {
  let resolvedMembership =
    knownMembership !== undefined
      ? knownMembership
      : user.activeOrganizationId
        ? await Membership.findOne({ user: user._id, organization: user.activeOrganizationId })
        : await Membership.findOne({ user: user._id }).sort({ createdAt: 1 });
  let organization = resolvedMembership
    ? knownOrganization !== undefined &&
      knownOrganization?._id.equals(resolvedMembership.organization)
      ? knownOrganization
      : await Organization.findById(resolvedMembership.organization)
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

  return { membership: resolvedMembership, organization };
}

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

  // A hot cache hit skips every DB round trip below entirely — see
  // auth-cache.ts's docstring for why (repeat lookups within one page load)
  // and the staleness trade-off it accepts. Only ever populated on this same
  // function's own success path, so a hit has already passed every check a
  // miss is about to run.
  const cached = getCachedAuth(payload.id, payload.jti);
  if (cached) {
    req.user = cached.user;
    req.membership = cached.membership;
    req.organization = cached.organization;
    if (payload.jti) req.sessionJti = payload.jti;
    next();
    return;
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
  //
  // The organization lookup below is SPECULATIVE, fetched in this same batch
  // purely as a latency optimization: it only depends on `user.
  // activeOrganizationId`, which is already known at this point, so it never
  // has to wait for the membership query the way `resolveActiveOrganization`
  // used to sequence it. In the common case (membership resolves to this
  // same org) it saves a whole extra round trip; `resolveActiveOrganization`
  // re-fetches on its own if this guess turns out stale.
  const [session, membership, speculativeOrganization] = await Promise.all([
    payload.jti ? Session.findOne({ user: user._id, jti: payload.jti }) : null,
    user.activeOrganizationId
      ? Membership.findOne({ user: user._id, organization: user.activeOrganizationId })
      : Membership.findOne({ user: user._id }).sort({ createdAt: 1 }),
    user.activeOrganizationId ? Organization.findById(user.activeOrganizationId) : null,
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
  // pre-backfill account, mid-signup race) — `resolveActiveOrganization`
  // falls back to ANY membership they actually still have before ever
  // bootstrapping a brand-new personal org, so switching back is never
  // silently lost. Reuses `membership` AND `speculativeOrganization` from
  // the parallel lookup above instead of re-querying either.
  const resolved = await resolveActiveOrganization(user, membership, speculativeOrganization);

  req.user = user;
  req.membership = resolved.membership;
  req.organization = resolved.organization;
  setCachedAuth(payload.id, payload.jti, {
    user,
    membership: resolved.membership,
    organization: resolved.organization,
  });
  next();
});
