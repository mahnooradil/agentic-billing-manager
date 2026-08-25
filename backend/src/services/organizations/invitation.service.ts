/**
 * Invitation lifecycle — create, and the two distinct accept paths:
 *  - a brand-new email (no User yet) joins via the normal OTP register flow;
 *    `consumeInvitationForNewSignup` is called FROM `verifyOtp` right after
 *    the User is created, instead of bootstrapping a personal Organization.
 *  - an email that already has an account calls the authenticated
 *    `POST /api/invitations/:token/accept` endpoint, which uses
 *    `acceptInvitationForExistingUser` below.
 *
 * A user can belong to multiple organizations — accepting an invite ADDS a
 * membership in the new org alongside whatever else the user already
 * belongs to (their personal workspace included, data and all) rather than
 * replacing it. The newly joined org becomes their active one, but nothing
 * about their other membership(s) is touched.
 */
import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";

import { AppError } from "@/utils/appError";
import {
  Invitation,
  type InvitationDocument,
  type InvitationStatus,
} from "@/models/invitation.model";
import { Membership, type MembershipDocument, type MembershipRole } from "@/models/membership.model";
import { Organization, type OrganizationDocument } from "@/models/organization.model";
import { Notification } from "@/models/notification.model";
import { emitNotificationCreated } from "@/services/events/notification.events";
import { User } from "@/models/user.model";
import { ensureOwnerHasPersonalWorkspace } from "@/services/organizations/organization-bootstrap.service";

const INVITATION_TTL_DAYS = 7;

/** Notifies the organization (via the existing Notification/bell system) that
 *  someone just joined — the ONLY way an owner currently finds out a pending
 *  invite was accepted, short of re-opening the Team tab. Best-effort: a
 *  notification failure must never break the join itself. */
async function notifyMemberJoined(
  organizationId: Types.ObjectId,
  userId: Types.ObjectId,
  role: MembershipRole
): Promise<void> {
  try {
    const user = await User.findById(userId);
    const name = user?.fullName ?? "Someone";
    const doc = await Notification.create({
      organization: organizationId,
      title: "New team member",
      message: `${name} joined as ${role}.`,
      severity: "info",
      category: "system",
      signature: `member:joined:${userId.toString()}:${Date.now()}`,
      read: false,
      archived: false,
      source: "invitation-service",
    });
    emitNotificationCreated(doc);
  } catch {
    // Best-effort — see docstring.
  }
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * After someone new joins an organization, makes sure that org's OWNER
 * still has a private workspace of their own — inviting someone into your
 * own workspace turns it into a shared one, and without this the inviter
 * (not just the person joining) could be left with no personal workspace at
 * all. Safe to call on every join: `ensureOwnerHasPersonalWorkspace` itself
 * no-ops once the owner already has one. Best-effort — never blocks the join.
 */
async function ensureInviterKeepsPersonalWorkspace(
  organizationId: Types.ObjectId
): Promise<void> {
  try {
    const ownerMembership = await Membership.findOne({
      organization: organizationId,
      role: "owner",
    });
    if (!ownerMembership) return;
    const owner = await User.findById(ownerMembership.user);
    if (!owner) return;
    await ensureOwnerHasPersonalWorkspace(owner._id, owner.fullName, organizationId);
  } catch {
    // Best-effort — see docstring.
  }
}

/** Creates a pending invitation. Caller (the controller) sends the email. */
export async function createInvitation(
  organizationId: Types.ObjectId,
  email: string,
  role: MembershipRole,
  invitedByUserId: Types.ObjectId
): Promise<InvitationDocument> {
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  return Invitation.create({
    organization: organizationId,
    email: email.toLowerCase().trim(),
    role,
    invitedBy: invitedByUserId,
    token: generateToken(),
    status: "pending",
    expiresAt,
  });
}

/** A pending, not-yet-expired invitation for this email, if any. Expired ones
 *  are flipped to "expired" as a side effect (lazy cleanup, no cron needed). */
async function findLiveInvitationByEmail(email: string): Promise<InvitationDocument | null> {
  const invitation = await Invitation.findOne({
    email: email.toLowerCase().trim(),
    status: "pending",
  });
  if (!invitation) return null;
  if (invitation.expiresAt < new Date()) {
    invitation.status = "expired";
    await invitation.save();
    return null;
  }
  return invitation;
}

/**
 * Called from `verifyOtp` right after a brand-new User is created. If this
 * email has a live invitation, joins that organization with the invited role
 * instead of bootstrapping a personal one — returns null when there's no
 * invitation (the normal signup path applies instead).
 */
export async function consumeInvitationForNewSignup(
  userId: Types.ObjectId,
  email: string
): Promise<{ organization: OrganizationDocument; membership: MembershipDocument } | null> {
  const invitation = await findLiveInvitationByEmail(email);
  if (!invitation) return null;

  const organization = await Organization.findById(invitation.organization);
  if (!organization) return null; // orphaned invitation — fall back to personal org

  const membership = await Membership.create({
    user: userId,
    organization: organization._id,
    role: invitation.role,
  });
  invitation.status = "accepted";
  await invitation.save();
  await notifyMemberJoined(organization._id, userId, invitation.role);
  await ensureInviterKeepsPersonalWorkspace(organization._id);

  return { organization, membership };
}

/**
 * POST /invitations/:token/accept for an ALREADY-authenticated user. Throws
 * a clear AppError for every rejection path — never silently no-ops. Adds a
 * new Membership alongside whatever the user already belongs to (their
 * personal workspace's data is never touched), and switches their active
 * organization to the one they just joined.
 */
export async function acceptInvitationForExistingUser(
  token: string,
  userId: Types.ObjectId,
  userEmail: string
): Promise<{ organization: OrganizationDocument; role: MembershipRole }> {
  const invitation = await Invitation.findOne({ token });
  if (!invitation || invitation.status !== "pending") {
    throw new AppError("This invitation is no longer valid.", 404);
  }
  if (invitation.expiresAt < new Date()) {
    invitation.status = "expired";
    await invitation.save();
    throw new AppError("This invitation has expired.", 410);
  }
  if (invitation.email !== userEmail.toLowerCase().trim()) {
    throw new AppError("This invitation was sent to a different email address.", 403);
  }

  const alreadyMember = await Membership.findOne({
    user: userId,
    organization: invitation.organization,
  });
  if (alreadyMember) {
    throw new AppError("You're already a member of this organization.", 409);
  }

  const organization = await Organization.findById(invitation.organization);
  if (!organization) {
    throw new AppError("This invitation's organization no longer exists.", 404);
  }

  await Membership.create({
    user: userId,
    organization: organization._id,
    role: invitation.role,
  });
  invitation.status = "accepted";
  await invitation.save();
  await notifyMemberJoined(organization._id, userId, invitation.role);
  await ensureInviterKeepsPersonalWorkspace(organization._id);

  // Land the user in the workspace they just joined — their other
  // membership(s), if any, are unaffected and still switchable back to.
  await User.updateOne({ _id: userId }, { $set: { activeOrganizationId: organization._id } });

  return { organization, role: invitation.role };
}

/** Revokes a pending invitation (owner/admin action). */
export async function revokeInvitation(
  organizationId: Types.ObjectId,
  invitationId: string
): Promise<void> {
  const invitation = await Invitation.findOne({
    _id: invitationId,
    organization: organizationId,
  });
  if (!invitation) throw new AppError("Invitation not found", 404);
  if (invitation.status !== "pending") {
    throw new AppError("Only a pending invitation can be revoked.", 400);
  }
  invitation.status = "revoked" as InvitationStatus;
  await invitation.save();
}
