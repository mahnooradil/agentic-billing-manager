/**
 * Authentication controllers — passwordless. Every session starts the same
 * way: request a 6-digit code by email, then verify it. Verifying an unknown
 * email (register flow only, since it collects a name) creates the account;
 * verifying a known email just logs it in. There is no password anywhere.
 */
import { createHash, randomUUID } from "node:crypto";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { generateToken } from "@/utils/jwt";
import { toPublicUser } from "@/utils/user.serializer";
import { User, type UserDocument } from "@/models/user.model";
import { Otp, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS } from "@/models/otp.model";
import { UserSettings } from "@/models/user-settings.model";
import { Billing } from "@/models/billing.model";
import { Platform } from "@/models/platform.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Recommendation } from "@/models/recommendation.model";
import { Notification } from "@/models/notification.model";
import { AgentSession } from "@/models/agent-session.model";
import { Session, type SessionDocument } from "@/models/session.model";
import { SupportRequest } from "@/models/support-request.model";
import { sendOtpEmail } from "@/services/email/resend";
import { resetAgentSession } from "@/services/agent/managed-agent.service";
import type {
  RequestRegisterOtpInput,
  RequestLoginOtpInput,
  VerifyOtpInput,
  UpdateProfileInput,
  RequestEmailChangeInput,
  VerifyEmailChangeInput,
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

  const code = String(Math.floor(100000 + Math.random() * 900000));
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

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await otp.deleteOne();
    throw new AppError(
      "Too many incorrect attempts. Please request a new code.",
      400
    );
  }

  if (hashCode(code) !== otp.codeHash) {
    otp.attempts += 1;
    await otp.save();
    const remaining = OTP_MAX_ATTEMPTS - otp.attempts;
    throw new AppError(
      `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      400
    );
  }

  await otp.deleteOne();
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

/** POST /api/auth/login/request-otp — start signing in to an existing account. */
export const requestLoginOtp = asyncHandler(async (req, res) => {
  const { email } = req.body as RequestLoginOtpInput;

  const existingUser = await User.findOne({ email });
  if (!existingUser) {
    throw new AppError(
      "No account found with this email. Please sign up first.",
      404
    );
  }

  await issueOtp(email);
  sendSuccess(res, 200, "Verification code sent", null);
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

  let user = await User.findOne({ email });
  let isNewUser = false;
  if (!user) {
    user = await User.create({ fullName: fullNameFromOtp ?? email, email });
    isNewUser = true;
  }

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

  sendSuccess(res, 200, "Profile updated", {
    user: toPublicUser(user),
  });
});

/**
 * DELETE /api/auth/account — permanently deletes the authenticated user and
 * every piece of data scoped to them. Irreversible; there is no soft-delete.
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  // Archives the Managed Agents session server-side before the local
  // pointer (and everything else) is wiped below.
  await resetAgentSession(user._id).catch(() => {
    // Best-effort — a stale/unreachable agent session must not block deletion.
  });

  await Promise.all([
    UserSettings.deleteMany({ user: user._id }),
    Billing.deleteMany({ user: user._id }),
    Platform.deleteMany({ user: user._id }),
    PlatformConnection.deleteMany({ user: user._id }),
    Recommendation.deleteMany({ user: user._id }),
    Notification.deleteMany({ user: user._id }),
    AgentSession.deleteMany({ user: user._id }),
    Session.deleteMany({ user: user._id }),
    SupportRequest.deleteMany({ user: user._id }),
    Otp.deleteMany({ email: user.email }),
  ]);

  await user.deleteOne();

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

  sendSuccess(res, 200, "Session revoked", null);
});
