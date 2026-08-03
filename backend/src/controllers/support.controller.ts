/**
 * Support request controllers — backs the "Priority support" plan feature.
 * There is no support team/admin panel in this app: a request is persisted
 * (so the user can see its own status) and best-effort emailed to the support
 * inbox with a priority flag, so a human can actually triage it. Email
 * delivery never blocks or fails the request — Resend may be unconfigured.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicSupportRequest } from "@/utils/support.serializer";
import { SupportRequest } from "@/models/support-request.model";
import { env } from "@/config/env";
import {
  sendSupportRequestEmail,
  sendSupportRequestConfirmationEmail,
} from "@/services/email/resend";
import type { CreateSupportRequestInput } from "@/validators/support.validator";

/** POST /api/support — submit a support request. */
export const createSupportRequestHandler = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const { category, subject, message } = req.body as CreateSupportRequestInput;
  const isPriority = user.planTier !== "Free";

  const request = await SupportRequest.create({
    user: user._id,
    category,
    subject,
    message,
    priority: isPriority ? "priority" : "standard",
  });

  if (env.supportInboxEmail) {
    await sendSupportRequestEmail({
      inbox: env.supportInboxEmail,
      fromUserEmail: user.email,
      fromUserName: user.fullName,
      isPriority,
      category,
      subject,
      message,
    }).catch(() => {
      // Best-effort — the request is already saved; email delivery (Resend
      // may be unconfigured/unapproved) never blocks the user-facing response.
    });
  }

  // Best-effort, independent of the inbox notification above — the requester
  // should get an acknowledgment even if the inbox side were ever removed.
  await sendSupportRequestConfirmationEmail({
    to: user.email,
    subject,
    isPriority,
  }).catch(() => {
    // Same reasoning: never block the response on email delivery.
  });

  sendSuccess(res, 201, "Support request submitted", {
    request: toPublicSupportRequest(request),
  });
});

/** GET /api/support — the caller's own support requests, newest first. */
export const listSupportRequestsHandler = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const requests = await SupportRequest.find({ user: user._id }).sort({
    createdAt: -1,
  });

  sendSuccess(res, 200, "Support requests retrieved", {
    requests: requests.map(toPublicSupportRequest),
  });
});
