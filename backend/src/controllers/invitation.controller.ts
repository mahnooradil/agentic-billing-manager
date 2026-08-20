/**
 * Invitation controllers — create/revoke (organization-scoped, owner/admin)
 * plus the public preview and authenticated accept (not organization-scoped,
 * since accepting means JOINING an org the caller isn't in yet).
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicInvitation } from "@/utils/invitation.serializer";
import { toPublicOrganization } from "@/utils/organization.serializer";
import { Invitation } from "@/models/invitation.model";
import { Membership } from "@/models/membership.model";
import { Organization } from "@/models/organization.model";
import { User } from "@/models/user.model";
import { createInvitation, acceptInvitationForExistingUser } from "@/services/organizations/invitation.service";
import { sendOrganizationInviteEmail } from "@/services/email/resend";
import type { CreateInvitationInput } from "@/validators/invitation.validator";

/** POST /api/organization/invitations — invite by email (owner/admin only). */
export const createOrganizationInvitation = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  const membership = req.membership;
  if (!user || !organization || !membership) {
    throw new AppError("Authentication required", 401);
  }
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can invite people.", 403);
  }

  const { email, role } = req.body as CreateInvitationInput;

  const existingMember = await User.findOne({ email });
  if (existingMember) {
    const theirMembership = await Membership.findOne({ user: existingMember._id });
    if (theirMembership?.organization.equals(organization._id)) {
      throw new AppError("This person is already a member.", 409);
    }
  }

  const invitation = await createInvitation(organization._id, email, role, user._id);

  await sendOrganizationInviteEmail({
    to: invitation.email,
    organizationName: organization.name,
    inviterName: user.fullName,
    role: invitation.role,
    token: invitation.token,
  }).catch(() => {
    // Best-effort — the invitation is already saved; email delivery (Resend
    // may be unconfigured) never blocks the response.
  });

  sendSuccess(res, 201, "Invitation sent", {
    invitation: toPublicInvitation(invitation),
  });
});

/** DELETE /api/organization/invitations/:id — revoke a pending invite. */
export const revokeOrganizationInvitation = asyncHandler(async (req, res) => {
  const membership = req.membership;
  const organization = req.organization;
  if (!organization || !membership) throw new AppError("Authentication required", 401);
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can revoke invitations.", 403);
  }

  const invitation = await Invitation.findOne({
    _id: req.params.id as string,
    organization: organization._id,
  });
  if (!invitation) throw new AppError("Invitation not found", 404);
  if (invitation.status !== "pending") {
    throw new AppError("Only a pending invitation can be revoked.", 400);
  }
  invitation.status = "revoked";
  await invitation.save();

  sendSuccess(res, 200, "Invitation revoked", { id: invitation._id.toString() });
});

/**
 * GET /api/invitations/:token — PUBLIC preview (no auth) so someone who
 * doesn't have an account yet can see what they're accepting before signing
 * up. Never reveals more than organization name + role + inviter's name.
 */
export const previewInvitation = asyncHandler(async (req, res) => {
  const token = req.params.token as string;
  const invitation = await Invitation.findOne({ token });
  if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
    throw new AppError("This invitation is invalid or has expired.", 404);
  }

  const [organization, inviter] = await Promise.all([
    Organization.findById(invitation.organization),
    User.findById(invitation.invitedBy),
  ]);
  if (!organization) throw new AppError("This invitation's organization no longer exists.", 404);

  sendSuccess(res, 200, "Invitation preview retrieved", {
    email: invitation.email,
    role: invitation.role,
    organizationName: organization.name,
    inviterName: inviter?.fullName ?? "Someone",
    // Lets the accept-invite page decide whether to show a login or a
    // register form for this email, without a separate lookup.
    hasExistingAccount: Boolean(await User.exists({ email: invitation.email })),
  });
});

/**
 * POST /api/invitations/:token/accept — authenticated accept, for an email
 * that ALREADY has an account. A brand-new email instead goes through the
 * normal register (OTP) flow, which itself checks for a live invitation —
 * see auth.controller.ts's verifyOtp.
 */
export const acceptInvitation = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError("Authentication required", 401);

  const token = req.params.token as string;
  const { organization, role } = await acceptInvitationForExistingUser(
    token,
    user._id,
    user.email
  );

  sendSuccess(res, 200, "Invitation accepted", {
    organization: toPublicOrganization(organization, role),
  });
});
