/**
 * Authentication controllers — passwordless. Every session starts the same
 * way: request a 6-digit code by email, then verify it. Verifying an unknown
 * email (register flow only, since it collects a name) creates the account;
 * verifying a known email just logs it in. There is no password anywhere.
 */
import { createHash, randomInt, randomUUID } from "node:crypto";

import mongoose from "mongoose";
import { OAuth2Client } from "google-auth-library";

import { env } from "@/config/env";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { generateToken } from "@/utils/jwt";
import { toPublicUser } from "@/utils/user.serializer";
import { toPublicOrganization } from "@/utils/organization.serializer";
import { User, type UserDocument } from "@/models/user.model";
import { Otp, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS } from "@/models/otp.model";
import { UserSettings } from "@/models/user-settings.model";
import { Billing } from "@/models/billing.model";
import { BillingEvent } from "@/models/billing-event.model";
import { UsageAccrual } from "@/models/usage-accrual.model";
import { Vendor } from "@/models/vendor.model";
import { Platform } from "@/models/platform.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Recommendation } from "@/models/recommendation.model";
import { Notification } from "@/models/notification.model";
import { AgentSession } from "@/models/agent-session.model";
import { Session, type SessionDocument } from "@/models/session.model";
import { SupportRequest } from "@/models/support-request.model";
import { CreditTransaction } from "@/models/credit-transaction.model";
import { Invitation } from "@/models/invitation.model";
import { Subscription } from "@/models/subscription.model";
import { sendOtpEmail } from "@/services/email/resend";
import { resetAgentSession, resetAllAgentSessionsForUser } from "@/services/agent/managed-agent.service";
import { cancelActiveSubscription } from "@/services/payments/stripe-subscription.service";
import { grantCredits } from "@/services/credits/credit-ledger.service";
import { STARTING_CREDITS } from "@/config/credits";
import { Membership } from "@/models/membership.model";
import { Organization } from "@/models/organization.model";
import { createPersonalOrganization } from "@/services/organizations/organization-bootstrap.service";
import { consumeInvitationForNewSignup } from "@/services/organizations/invitation.service";
import { invalidateCachedAuth } from "@/middlewares/auth-cache";
import type {
  RequestRegisterOtpInput,
  RequestLoginOtpInput,
  VerifyOtpInput,
  UpdateProfileInput,
  RequestEmailChangeInput,
  VerifyEmailChangeInput,
  SwitchOrganizationInput,
  GoogleSignInInput,
} from "@/validators/auth.validator";

/** Minimum time between two codes for the same email (avoids spamming Resend). */
const RESEND_COOLDOWN_MS = 30_000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Generates, stores, and emails a fresh 6-digit code for one email. */
async function issueOtp(email: string, fullName?: string): Promise<void> {
  const existing = await Otp.findOne({ email });
  if (existing) {
    const elapsed = Date.now() - existing.updatedAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new AppError(
        `Please wait ${waitSeconds}s before requesting another code.`,
        429
      );
    }
  }

  // crypto.randomInt, not Math.random — the OTP is the entire credential in
  // this passwordless app, so it must come from a CSPRNG, not a predictable
  // PRNG whose state could be recovered from self-issued codes (S-02).
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await Otp.findOneAndUpdate(
    { email },
    { email, codeHash: hashCode(code), fullName, attempts: 0, expiresAt },
    { upsert: true }
  );

  await sendOtpEmail(email, code);
}

/**
 * Validates a submitted code against the stored OTP for `email` — shared by
 * both the login/register verify step and the change-email verify step.
 * Throws on any failure (expired, too many attempts, wrong code); deletes the
 * OTP document once it succeeds so it can never be replayed.
 */
async function consumeOtp(email: string, code: string): Promise<void> {
  const otp = await Otp.findOne({ email });
  if (!otp || otp.expiresAt.getTime() < Date.now()) {
    if (otp) await otp.deleteOne();
    throw new AppError(
      "This code has expired or wasn't found. Please request a new one.",
      400
    );
  }

  if (hashCode(code) === otp.codeHash) {
    await otp.deleteOne();
    return;
  }

  // Atomic increment (S-03 fix) — the previous `otp.attempts += 1; await
  // otp.save()` was a read-modify-write: every concurrent wrong guess read
  // the same starting value, so N concurrent guesses all passed the limit
  // check and all wrote `attempts = 1`, making the 5-attempt ceiling
  // bypassable by concurrency alone. This `findOneAndUpdate` with
  // `attempts: { $lt: OTP_MAX_ATTEMPTS }` in the filter makes the
  // check-and-increment one atomic database operation — at most
  // OTP_MAX_ATTEMPTS concurrent guesses can ever succeed in incrementing,
  // no matter how many arrive at once.
  const updated = await Otp.findOneAndUpdate(
    { _id: otp._id, attempts: { $lt: OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  );

  if (!updated || updated.attempts >= OTP_MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: otp._id });
    throw new AppError(
      "Too many incorrect attempts. Please request a new code.",
      400
    );
  }

  const remaining = OTP_MAX_ATTEMPTS - updated.attempts;
  throw new AppError(
    `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    400
  );
}

/**
 * Finds the account for `email`, or creates one — shared by `verifyOtp` and
 * `googleSignIn` (both single-step "prove this email, then get in" flows
 * that need the exact same new-account bootstrap: personal workspace +
 * starting credits, or joining a live invitation instead when one exists).
 */
async function findOrCreateUser(
  email: string,
  fullNameForNewAccount: string
): Promise<{ user: UserDocument; isNewUser: boolean }> {
  let user = await User.findOne({ email });
  if (user) return { user, isNewUser: false };

  user = await User.create({ fullName: fullNameForNewAccount, email });

  // A live invitation for this email joins that organization (with the
  // invited role) instead of bootstrapping a fresh personal one.
  const joined = await consumeInvitationForNewSignup(user._id, email);
  if (!joined) {
    // Signup credit grant — a real ledger entry (services/credits/), not a
    // bare schema default, so the balance is explainable from day one.
    // Only for a BRAND NEW personal workspace — an org joined via
    // invitation already has its own credit history/allowance, so there's
    // nothing to "start" here.
    const { organization } = await createPersonalOrganization(user._id, user.fullName);
    await grantCredits(organization._id, STARTING_CREDITS, "signup_grant", "grant", user._id);
  }

  return { user, isNewUser: true };
}

/** Creates a session for a freshly-issued token and signs it with the session's jti. */
async function issueSession(
  user: UserDocument,
  req: { headers: { "user-agent"?: string }; ip?: string }
): Promise<string> {
  const jti = randomUUID();
  await Session.create({
    user: user._id,
    jti,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
    lastSeenAt: new Date(),
  });
  return generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion, jti });
}

/** POST /api/auth/register/request-otp — start creating a new account. */
export const requestRegisterOtp = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body as RequestRegisterOtpInput;

  // Already registered? Don't error — just send a normal login code instead
  // (no name needed; the existing account is left untouched).
  const existingUser = await User.findOne({ email });
  await issueOtp(email, existingUser ? undefined : fullName);

  sendSuccess(res, 200, "Verification code sent", null);
});

/**
 * POST /api/auth/login/request-otp — start signing in to an existing account.
 *
 * Uniform response regardless of whether the account exists (S-13) — the
 * previous explicit 404 ("No account found...") let anyone enumerate which
 * emails have accounts. Now: if the account exists, a real code is issued;
 * if not, this is a silent no-op (no Otp record, no email) — but the
 * response is identical either way, so the two cases are indistinguishable
 * from the outside. A verify-otp attempt against a non-existent account's
 * email correctly fails as "expired or wasn't found," the same message a
 * genuinely wrong/expired code produces.
 */
export const requestLoginOtp = asyncHandler(async (req, res) => {
  const { email } = req.body as RequestLoginOtpInput;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    await issueOtp(email);
  }

  sendSuccess(
    res,
    200,
    "If an account exists for this email, a verification code has been sent.",
    null
  );
});

/**
 * POST /api/auth/verify-otp — the single completion step for both register
 * and login. Creates the account on first verify (register flow) or logs
 * into the existing one (login flow / already-registered register attempt).
 */
export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body as VerifyOtpInput;

  // Read the OTP's `fullName` (register flow) before `consumeOtp` deletes it.
  const otp = await Otp.findOne({ email });
  if (!otp) {
    throw new AppError(
      "This code has expired or wasn't found. Please request a new one.",
      400
    );
  }
  const fullNameFromOtp = otp.fullName;

  await consumeOtp(email, code);

  const { user, isNewUser } = await findOrCreateUser(email, fullNameFromOtp ?? email);
  const token = await issueSession(user, req);

  sendSuccess(res, 200, isNewUser ? "Account created" : "Login successful", {
    token,
    user: toPublicUser(user),
  });
});

/**
 * POST /api/auth/google — "Continue with Google". Verifies the ID token
 * Google Identity Services hands the frontend after a successful sign-in,
 * then reuses the exact same find-or-create-account path as `verifyOtp` —
 * an unknown email creates a personal workspace, a known one just logs in.
 * No password, no OTP: Google has already proven the email for us.
 */
export const googleSignIn = asyncHandler(async (req, res) => {
  if (!env.googleClientId) {
    throw new AppError("Google sign-in isn't configured on this server.", 503);
  }

  const { credential } = req.body as GoogleSignInInput;

  const client = new OAuth2Client(env.googleClientId);
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError("Could not verify this Google sign-in. Please try again.", 401);
  }

  if (!payload?.email || !payload.email_verified) {
    throw new AppError("This Google account's email address isn't verified.", 401);
  }

  const { user, isNewUser } = await findOrCreateUser(
    payload.email,
    payload.name ?? payload.email
  );
  const token = await issueSession(user, req);

  sendSuccess(res, 200, isNewUser ? "Account created" : "Login successful", {
    token,
    user: toPublicUser(user),
  });
});

/** GET /api/auth/me — return the authenticated user (guarded by `authenticate`). */
export const getMe = asyncHandler(async (req, res) => {
  // `authenticate` guarantees `req.user` is set before this handler runs.
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  sendSuccess(res, 200, "Authenticated user retrieved", {
    user: toPublicUser(user),
  });
});

/** GET /api/auth/organizations — every organization this user belongs to,
 *  their role in each, and which one is currently active (see
 *  `req.organization`, resolved from the same `activeOrganizationId` by
 *  `authenticate`). */
export const listMyOrganizations = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError("Authentication required", 401);

  const memberships = await Membership.find({ user: user._id }).sort({ createdAt: 1 });
  const organizations = await Organization.find({
    _id: { $in: memberships.map((m) => m.organization) },
  });
  const orgById = new Map(organizations.map((o) => [o._id.toString(), o]));

  sendSuccess(res, 200, "Organizations retrieved", {
    organizations: memberships
      .map((m) => {
        const organization = orgById.get(m.organization.toString());
        if (!organization) return null;
        return {
          ...toPublicOrganization(organization, m.role),
          isActive: Boolean(user.activeOrganizationId?.equals(organization._id)),
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null),
  });
});

/**
 * POST /api/auth/switch-organization — changes which of the caller's own
 * organizations is active for every request from here on. Only ever
 * switches to an organization the caller actually has a Membership in —
 * never trusts a bare id, so this can't be used to hop into someone else's
 * workspace no matter what id is sent.
 */
export const switchOrganization = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError("Authentication required", 401);

  const { organizationId } = req.body as SwitchOrganizationInput;
  const membership = await Membership.findOne({
    user: user._id,
    organization: organizationId,
  });
  if (!membership) {
    throw new AppError("You're not a member of that organization.", 403);
  }

  const organization = await Organization.findById(membership.organization);
  if (!organization) {
    throw new AppError("This organization no longer exists.", 404);
  }

  // Each organization now has its own Agent Session row (WP-7 — see
  // agent-session.model.ts), so a switch can no longer blend one
  // workspace's conversation into another's reply even if this call
  // failed. Kept anyway as the deliberate UX choice it always was: a
  // workspace switch starts a clean chat in the newly active organization
  // rather than resuming wherever that org's conversation last left off.
  await resetAgentSession(user._id, membership.organization).catch(() => {
    // Best-effort — a stale/unreachable agent session must not block the switch.
  });

  user.activeOrganizationId = membership.organization;
  await user.save();
  // Otherwise a still-warm auth cache entry could keep resolving requests
  // against the OLD organization for up to its TTL — see auth-cache.ts.
  invalidateCachedAuth(user._id.toString());

  sendSuccess(res, 200, "Switched organization", {
    organization: toPublicOrganization(organization, membership.role),
  });
});

/**
 * POST /api/auth/logout — revokes THIS device's own session, so it stops
 * showing as an active session (Security tab) the moment the user signs
 * out, instead of lingering there until its token naturally expires. Every
 * `verifyOtp`/`googleSignIn` call mints a brand new Session row — without
 * this endpoint, logging out never told the backend, so old sessions just
 * piled up looking "active" forever.
 */
export const logout = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  if (req.sessionJti) {
    await Session.updateOne(
      { jti: req.sessionJti, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );
    invalidateCachedAuth(user._id.toString());
  }

  sendSuccess(res, 200, "Signed out", null);
});

/**
 * POST /api/auth/sign-out-everywhere — invalidates every JWT issued before
 * now (bumps `tokenVersion`), then immediately issues a fresh one so THIS
 * session stays signed in — only other devices/tabs get logged out.
 */
export const signOutEverywhere = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  user.tokenVersion += 1;
  await user.save();

  // Keep the Security tab's session list honest: every OTHER session is
  // revoked outright (tokenVersion alone would block their tokens but leave
  // them showing as "active" in the list). This device's session is untouched
  // and its token just gets re-signed with the new tokenVersion.
  await Session.updateMany(
    { user: user._id, jti: { $ne: req.sessionJti }, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
  // The whole point of this endpoint is other devices losing access
  // immediately — a stale auth-cache entry must not give any of them a few
  // more free seconds. See auth-cache.ts.
  invalidateCachedAuth(user._id.toString());

  const token = generateToken({
    id: user._id.toString(),
    tokenVersion: user.tokenVersion,
    jti: req.sessionJti,
  });

  sendSuccess(res, 200, "Signed out of all other devices", { token });
});

/** PATCH /api/auth/profile — update the authenticated user's display name. */
export const updateProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const { fullName } = req.body as UpdateProfileInput;
  user.fullName = fullName;
  await user.save();
  invalidateCachedAuth(user._id.toString());

  sendSuccess(res, 200, "Profile updated", {
    user: toPublicUser(user),
  });
});

/**
 * DELETE /api/auth/account — permanently deletes the authenticated user and
 * every piece of data scoped to them. Irreversible; there is no soft-delete.
 *
 * Organization-aware, and now checked across EVERY organization this user
 * belongs to (a user can hold several memberships): for each one where
 * they're Owner, being the ONLY member also takes that org's whole shared
 * data with them (nothing left to orphan); an Owner with other members in
 * ANY of their orgs blocks the whole deletion — transferring ownership or
 * removing everyone else first is a deliberate, explicit step, never
 * implicit. For every org where they're just admin/member, they simply
 * leave — that organization's shared data stays intact for the rest.
 *
 * WP-12 hardening (flow/03 item 25, CLAUDE.md's own "destructive,
 * irreversible operation" framing) — two fixes:
 *   1. The actual DB cascade now runs inside ONE MongoDB transaction
 *      (`session.withTransaction`). Previously every delete ran concurrently
 *      via `Promise.all` with no atomicity at all — a failure partway
 *      through (a network blip, a validation hook, a connection hiccup)
 *      left a half-deleted account: some collections wiped, others not,
 *      orphaned `Membership`/`Billing`/etc. rows pointing at an
 *      `Organization` that may or may not still exist. Now it's all-or-
 *      nothing: either every row and the `User` document itself are gone,
 *      or (on any failure) NONE of it is — the account is left exactly as
 *      it was, not half-deleted.
 *   2. The cascade's own collection list was incomplete — `BillingEvent`,
 *      `UsageAccrual`, `Vendor`, `Invitation`, and `Subscription` were never
 *      cleaned up for a deleted org at all, silently orphaned forever (same
 *      category of gap `deleteBillingRecord`'s own comment already
 *      disclosed for a single record's `BillingEvent` history — this is the
 *      same issue at the whole-organization scale). Added all five.
 *      Deleting an org with an ACTIVE Stripe subscription without actually
 *      canceling it at Stripe would keep charging the customer forever with
 *      no in-app record left to even notice — `cancelActiveSubscription` is
 *      now called for each owned org (same real external API call
 *      `updateMyPlan`'s downgrade-to-Free path already makes) before the
 *      local data is removed.
 *
 * External calls (Stripe cancellation, archiving Managed Agents sessions)
 * deliberately run BEFORE the transaction starts, never inside it — a DB
 * transaction must never wrap a third-party network call.
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const memberships = await Membership.find({ user: user._id });

  const ownedOrgs = memberships.filter((m) => m.role === "owner");
  const otherMemberCounts = await Promise.all(
    ownedOrgs.map((m) =>
      Membership.countDocuments({ organization: m.organization, user: { $ne: user._id } })
    )
  );
  const blockedOrg = ownedOrgs.find((_m, i) => otherMemberCounts[i] > 0);
  if (blockedOrg) {
    throw new AppError(
      "You're the owner of an organization with other members. Transfer ownership or remove every other member before deleting your account.",
      409
    );
  }

  // Archives EVERY one of this user's Managed Agents sessions (one per
  // organization — WP-7) server-side before the local pointers (and
  // everything else) are wiped below.
  await resetAllAgentSessionsForUser(user._id).catch(() => {
    // Best-effort — a stale/unreachable agent session must not block deletion.
  });

  // Stop real-world billing for every solo-owned org before its local
  // record disappears — see this function's own docstring for why.
  const ownedOrgDocs = await Organization.find({
    _id: { $in: ownedOrgs.map((m) => m.organization) },
  });
  await Promise.all(ownedOrgDocs.map((org) => cancelActiveSubscription(org)));

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Sequential, not Promise.all — operations sharing one session must
      // run one at a time; this is also what makes the whole thing atomic.
      for (const m of ownedOrgs) {
        await Billing.deleteMany({ organization: m.organization }, { session });
        await BillingEvent.deleteMany({ organization: m.organization }, { session });
        await UsageAccrual.deleteMany({ organization: m.organization }, { session });
        await Vendor.deleteMany({ organization: m.organization }, { session });
        await Platform.deleteMany({ organization: m.organization }, { session });
        await PlatformConnection.deleteMany({ organization: m.organization }, { session });
        await Recommendation.deleteMany({ organization: m.organization }, { session });
        await Notification.deleteMany({ organization: m.organization }, { session });
        await CreditTransaction.deleteMany({ organization: m.organization }, { session });
        await Invitation.deleteMany({ organization: m.organization }, { session });
        await Subscription.deleteMany({ organization: m.organization }, { session });
        await Organization.deleteOne({ _id: m.organization }, { session });
      }
      await Membership.deleteMany({ user: user._id }, { session });
      await UserSettings.deleteMany({ user: user._id }, { session });
      await AgentSession.deleteMany({ user: user._id }, { session });
      await Session.deleteMany({ user: user._id }, { session });
      await SupportRequest.deleteMany({ user: user._id }, { session });
      await Otp.deleteMany({ email: user.email }, { session });
      await User.deleteOne({ _id: user._id }, { session });
    });
  } finally {
    await session.endSession();
  }

  // Otherwise a cached entry could keep answering requests as this
  // now-deleted user for up to the cache TTL. See auth-cache.ts.
  invalidateCachedAuth(user._id.toString());

  sendSuccess(res, 200, "Account deleted", null);
});

/**
 * POST /api/auth/email/request-otp — sends a verification code to a NEW
 * email address to prove ownership before it replaces the current one.
 */
export const requestEmailChangeOtp = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const { newEmail } = req.body as RequestEmailChangeInput;

  if (newEmail === user.email) {
    throw new AppError("This is already your email address", 400);
  }
  const existing = await User.findOne({ email: newEmail });
  if (existing) {
    throw new AppError("This email is already in use", 409);
  }

  await issueOtp(newEmail);
  sendSuccess(res, 200, "Verification code sent", null);
});

/**
 * POST /api/auth/email/verify-otp — completes the change-email flow: verifies
 * the code sent to the new address, then updates the account.
 */
export const verifyEmailChangeOtp = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const { newEmail, code } = req.body as VerifyEmailChangeInput;

  await consumeOtp(newEmail, code);

  // Re-check for a race: another account could have claimed this email while
  // the code was pending.
  const existing = await User.findOne({ email: newEmail });
  if (existing && existing._id.toString() !== user._id.toString()) {
    throw new AppError("This email is already in use", 409);
  }

  user.email = newEmail;
  await user.save();

  sendSuccess(res, 200, "Email updated", { user: toPublicUser(user) });
});

/** GET /api/auth/sessions — lists the authenticated user's active sessions. */
export const listSessions = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const sessions = await Session.find({
    user: user._id,
    revokedAt: { $exists: false },
  }).sort({ lastSeenAt: -1 });

  sendSuccess(res, 200, "Sessions retrieved", {
    sessions: sessions.map((s: SessionDocument) => ({
      id: s._id.toString(),
      userAgent: s.userAgent ?? null,
      ip: s.ip ?? null,
      lastSeenAt: s.lastSeenAt,
      createdAt: s.createdAt,
      isCurrent: s.jti === req.sessionJti,
    })),
  });
});

/** DELETE /api/auth/sessions/:id — revokes one session (signs that device out). */
export const revokeSession = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const session = await Session.findOne({ _id: req.params.id, user: user._id });
  if (!session) {
    throw new AppError("Session not found", 404);
  }

  session.revokedAt = new Date();
  await session.save();
  // That revoked session's own cached entry (keyed by its jti) must not
  // keep answering requests for up to the cache TTL. See auth-cache.ts.
  invalidateCachedAuth(user._id.toString());

  sendSuccess(res, 200, "Session revoked", null);
});
