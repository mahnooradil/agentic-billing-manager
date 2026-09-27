import { Router } from "express";

import {
  requestRegisterOtp,
  requestLoginOtp,
  verifyOtp,
  googleSignIn,
  getMe,
  updateProfile,
  deleteAccount,
  logout,
  signOutEverywhere,
  requestEmailChangeOtp,
  verifyEmailChangeOtp,
  listSessions,
  revokeSession,
  listMyOrganizations,
  switchOrganization,
} from "@/controllers/auth.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { rateLimit } from "@/middlewares/rate-limit";
import {
  requestRegisterOtpSchema,
  requestLoginOtpSchema,
  verifyOtpSchema,
  updateProfileSchema,
  requestEmailChangeSchema,
  verifyEmailChangeSchema,
  switchOrganizationSchema,
  googleSignInSchema,
} from "@/validators/auth.validator";

const router = Router();

// Abuse protection (S-04) — these three are the entire credential surface
// of a passwordless app, previously completely unthrottled. Keyed by IP
// (these routes are unauthenticated), so `app.set('trust proxy', 1)` in
// app.ts must be in place for the key to be the real client, not the host's
// own proxy (S-15) — otherwise every caller shares one bucket.
// request-otp: bounded tighter, since each call sends a real email via
// Resend. verify-otp: more headroom for legitimate retries/typos — the
// per-code 5-attempt ceiling in consumeOtp() is the primary defense there,
// this is an IP-level backstop against hammering many different emails.
const requestOtpLimiter = rateLimit({ windowMs: 10 * 60_000, max: 5, key: "otp-request" });
const verifyOtpLimiter = rateLimit({ windowMs: 10 * 60_000, max: 20, key: "otp-verify" });

// Public endpoints — passwordless: request a code, then verify it.
router.post(
  "/register/request-otp",
  requestOtpLimiter,
  validate(requestRegisterOtpSchema),
  requestRegisterOtp
);
router.post(
  "/login/request-otp",
  requestOtpLimiter,
  validate(requestLoginOtpSchema),
  requestLoginOtp
);
router.post("/verify-otp", verifyOtpLimiter, validate(verifyOtpSchema), verifyOtp);
router.post("/google", validate(googleSignInSchema), googleSignIn);

// Protected endpoints — require a valid Bearer token
router.get("/me", authenticate, getMe);
router.patch("/profile", authenticate, validate(updateProfileSchema), updateProfile);
router.delete("/account", authenticate, deleteAccount);
router.post("/logout", authenticate, logout);
router.post("/sign-out-everywhere", authenticate, signOutEverywhere);
router.post(
  "/email/request-otp",
  authenticate,
  validate(requestEmailChangeSchema),
  requestEmailChangeOtp
);
router.post(
  "/email/verify-otp",
  authenticate,
  validate(verifyEmailChangeSchema),
  verifyEmailChangeOtp
);
router.get("/sessions", authenticate, listSessions);
router.delete("/sessions/:id", authenticate, revokeSession);
router.get("/organizations", authenticate, listMyOrganizations);
router.post(
  "/switch-organization",
  authenticate,
  validate(switchOrganizationSchema),
  switchOrganization
);

export default router;
