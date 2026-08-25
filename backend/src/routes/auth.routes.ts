import { Router } from "express";

import {
  requestRegisterOtp,
  requestLoginOtp,
  verifyOtp,
  getMe,
  updateProfile,
  deleteAccount,
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
import {
  requestRegisterOtpSchema,
  requestLoginOtpSchema,
  verifyOtpSchema,
  updateProfileSchema,
  requestEmailChangeSchema,
  verifyEmailChangeSchema,
  switchOrganizationSchema,
} from "@/validators/auth.validator";

const router = Router();

// Public endpoints — passwordless: request a code, then verify it.
router.post(
  "/register/request-otp",
  validate(requestRegisterOtpSchema),
  requestRegisterOtp
);
router.post(
  "/login/request-otp",
  validate(requestLoginOtpSchema),
  requestLoginOtp
);
router.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);

// Protected endpoints — require a valid Bearer token
router.get("/me", authenticate, getMe);
router.patch("/profile", authenticate, validate(updateProfileSchema), updateProfile);
router.delete("/account", authenticate, deleteAccount);
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
