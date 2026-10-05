/**
 * Sender trust — WP-11's learning loop (flow/04 §7). Lets a user SEE which
 * senders the pipeline has learned to trust/distrust, and manually
 * override or undo that — the "tells the user it did, with an undo" half
 * of the design; the automatic learning itself lives in
 * sender-profile-scheduler.ts and sender-trust.service.ts.
 */
import { isValidObjectId } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicSenderProfile } from "@/utils/sender-profile.serializer";
import { SenderProfile } from "@/models/sender-profile.model";
import { suppressSenderManually, restoreSender } from "@/services/email-sync/sender-trust.service";

/** GET /api/sender-profiles — every sender this organization's email sync
 *  has an opinion about, trust-worthy-first so suppressed/trusted senders
 *  (the ones worth a human's attention) aren't buried under neutral ones. */
export const listSenderProfiles = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const profiles = await SenderProfile.find({
    organization: organization._id,
    trust: { $ne: "neutral" },
  }).sort({ updatedAt: -1 });

  sendSuccess(res, 200, "Sender profiles retrieved", {
    profiles: profiles.map(toPublicSenderProfile),
  });
});

/** POST /api/sender-profiles/:id/suppress — manually mute a sender (owner/
 *  admin only, same tier as other billing-affecting mutations). */
export const suppressSenderProfile = asyncHandler(async (req, res) => {
  const organization = req.organization;
  const membership = req.membership;
  if (!organization || !membership) {
    throw new AppError("Authentication required", 401);
  }
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can mute a sender.", 403);
  }

  const id = req.params.id as string;
  if (!isValidObjectId(id)) {
    throw new AppError("Sender profile not found", 404);
  }
  const existing = await SenderProfile.findOne({ _id: id, organization: organization._id });
  if (!existing) {
    throw new AppError("Sender profile not found", 404);
  }

  const profile = await suppressSenderManually(organization._id, existing.domain);
  sendSuccess(res, 200, "Sender muted", { profile: toPublicSenderProfile(profile) });
});

/** POST /api/sender-profiles/:id/restore — undo a suppression (auto-
 *  learned or manual) and give the sender a genuine fresh start. */
export const restoreSenderProfile = asyncHandler(async (req, res) => {
  const organization = req.organization;
  const membership = req.membership;
  if (!organization || !membership) {
    throw new AppError("Authentication required", 401);
  }
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can restore a sender.", 403);
  }

  const id = req.params.id as string;
  if (!isValidObjectId(id)) {
    throw new AppError("Sender profile not found", 404);
  }
  const existing = await SenderProfile.findOne({ _id: id, organization: organization._id });
  if (!existing) {
    throw new AppError("Sender profile not found", 404);
  }

  const profile = await restoreSender(organization._id, existing.domain);
  if (!profile) {
    throw new AppError("Sender profile not found", 404);
  }
  sendSuccess(res, 200, "Sender restored", { profile: toPublicSenderProfile(profile) });
});
