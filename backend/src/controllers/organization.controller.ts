/**
 * Organization + membership management controllers — the "Team" surface.
 * All routes protected by `authenticate`; every query scoped to the caller's
 * own organization (`req.organization`).
 */
import { isValidObjectId, type Types } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicOrganization } from "@/utils/organization.serializer";
import { toPublicMember } from "@/utils/membership.serializer";
import { toPublicInvitation } from "@/utils/invitation.serializer";
import { toPublicPlatform } from "@/utils/platform.serializer";
import { toPublicPlatformConnection } from "@/utils/platform-connection.serializer";
import { toPublicBilling } from "@/utils/billing.serializer";
import { toPublicCreditTransaction } from "@/utils/credit-transaction.serializer";
import { toPublicAuditLog } from "@/utils/audit-log.serializer";
import { toPublicUserSettings } from "@/utils/user-settings.serializer";
import { Membership } from "@/models/membership.model";
import { Invitation } from "@/models/invitation.model";
import { User } from "@/models/user.model";
import { Platform } from "@/models/platform.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Billing } from "@/models/billing.model";
import { CreditTransaction } from "@/models/credit-transaction.model";
import { AuditLog } from "@/models/audit-log.model";
import { UserSettings } from "@/models/user-settings.model";
import { cleanupRedundantFallbackWorkspace } from "@/services/organizations/organization-bootstrap.service";
import { invalidateCachedAuth } from "@/middlewares/auth-cache";
import type {
  UpdateOrganizationInput,
  UpdateMembershipRoleInput,
} from "@/validators/organization.validator";

/** GET /api/organization — the caller's organization + their role in it. */
export const getMyOrganization = asyncHandler(async (req, res) => {
  const organization = req.organization;
  const membership = req.membership;
  if (!organization || !membership) throw new AppError("Authentication required", 401);

  sendSuccess(res, 200, "Organization retrieved", {
    organization: toPublicOrganization(organization, membership.role),
  });
});

/** PATCH /api/organization — rename the organization (owner/admin only). */
export const updateMyOrganization = asyncHandler(async (req, res) => {
  const organization = req.organization;
  const membership = req.membership;
  if (!organization || !membership) throw new AppError("Authentication required", 401);
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can rename the organization.", 403);
  }

  const { name } = req.body as UpdateOrganizationInput;
  organization.name = name;
  await organization.save();

  sendSuccess(res, 200, "Organization updated", {
    organization: toPublicOrganization(organization, membership.role),
  });
});

/** GET /api/organization/members — every member + every pending invitation. */
export const getMembers = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) throw new AppError("Authentication required", 401);

  const [memberships, invitations] = await Promise.all([
    Membership.find({ organization: organization._id }).sort({ createdAt: 1 }),
    Invitation.find({ organization: organization._id, status: "pending" }).sort({
      createdAt: -1,
    }),
  ]);

  const users = await User.find({ _id: { $in: memberships.map((m) => m.user) } });
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  sendSuccess(res, 200, "Members retrieved", {
    members: memberships
      .map((m) => {
        const user = userById.get(m.user.toString());
        return user ? toPublicMember(m, user) : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
    pendingInvitations: invitations.map(toPublicInvitation),
  });
});

/** Loads a membership by id, scoped to the organization, or 404s. */
async function findMembershipOr404(id: string, organizationId: Types.ObjectId) {
  if (!isValidObjectId(id)) throw new AppError("Member not found", 404);
  const membership = await Membership.findOne({ _id: id, organization: organizationId });
  if (!membership) throw new AppError("Member not found", 404);
  return membership;
}

/** PATCH /api/organization/members/:id — change a member's role (owner only). */
export const updateMemberRole = asyncHandler(async (req, res) => {
  const organization = req.organization;
  const membership = req.membership;
  if (!organization || !membership) throw new AppError("Authentication required", 401);
  if (membership.role !== "owner") {
    throw new AppError("Only the owner can change member roles.", 403);
  }

  const target = await findMembershipOr404(req.params.id as string, organization._id);
  if (target.role === "owner") {
    throw new AppError("The owner's role can't be changed here — transfer ownership instead.", 400);
  }

  const { role } = req.body as UpdateMembershipRoleInput;
  target.role = role;
  await target.save();
  // Otherwise the affected member's own cached auth context (their old
  // role, via req.membership) could keep answering for up to the cache
  // TTL — see auth-cache.ts.
  invalidateCachedAuth(target.user.toString());

  const targetUser = await User.findById(target.user);
  if (!targetUser) throw new AppError("Member's user account no longer exists.", 404);

  sendSuccess(res, 200, "Member role updated", {
    member: toPublicMember(target, targetUser),
  });
});

/** DELETE /api/organization/members/:id — remove a member (owner/admin only). */
export const removeMember = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  const membership = req.membership;
  if (!user || !organization || !membership) {
    throw new AppError("Authentication required", 401);
  }
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can remove members.", 403);
  }

  const target = await findMembershipOr404(req.params.id as string, organization._id);
  if (target.role === "owner") {
    throw new AppError("The owner can't be removed.", 400);
  }
  if (target.user.equals(user._id)) {
    throw new AppError("Use account deletion to remove yourself.", 400);
  }
  if (target.role === "admin" && membership.role !== "owner") {
    throw new AppError("Only the owner can remove an admin.", 403);
  }

  await target.deleteOne();
  // Otherwise the removed member's cached auth context could keep resolving
  // to this organization for up to the cache TTL — see auth-cache.ts.
  invalidateCachedAuth(target.user.toString());

  // If this removal leaves the organization solo-owned again, a fallback
  // personal workspace created for the owner (see
  // `ensureOwnerHasPersonalWorkspace`) may no longer be needed — clean it
  // up if it's still empty. Best-effort; never blocks the response.
  const remaining = await Membership.countDocuments({ organization: organization._id });
  if (remaining === 1) {
    const ownerMembership = await Membership.findOne({
      organization: organization._id,
      role: "owner",
    });
    if (ownerMembership) {
      await cleanupRedundantFallbackWorkspace(ownerMembership.user).catch(() => {
        // Best-effort — see docstring.
      });
    }
  }

  sendSuccess(res, 200, "Member removed", { id: target._id.toString() });
});

/**
 * GET /api/organization/export — WP-12 (flow/03 Sec7: "no full data export
 * (CSV-only)"). Every member can export their own organization's data (same
 * visibility they already have through the normal read endpoints — this
 * isn't a privilege escalation, just a different shape of the same read
 * access), as one downloadable JSON file rather than hunting through
 * several pages' worth of CSV exports one at a time.
 *
 * Scoped to what a person would actually recognize as "my data": the
 * organization record, platforms, platform connections (metadata only —
 * `toPublicPlatformConnection` never includes the encrypted credential),
 * billing records (with their full provenance trail), credit transactions,
 * the audit log, and the requesting user's own settings. Deliberately
 * EXCLUDES `Vendor` (an internal resolved-identity cache, not something the
 * user directly created or would recognize as "their" data — the vendor
 * name/domain a user cares about already travels on each Billing record
 * itself) and `Notification`/`Recommendation` (ephemeral, system-generated,
 * not the kind of record a portability request is about).
 */
export const exportMyData = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  if (!user || !organization) {
    throw new AppError("Authentication required", 401);
  }

  const [platforms, connections, billingRecords, creditTransactions, auditLog, userSettings] =
    await Promise.all([
      Platform.find({ organization: organization._id }),
      PlatformConnection.find({ organization: organization._id }),
      Billing.find({ organization: organization._id })
        .populate("platform", "name slug")
        .populate("platformConnection", "displayName platform accountIdentifier")
        .populate("vendor", "name domain"),
      CreditTransaction.find({ organization: organization._id }).sort({ createdAt: -1 }),
      AuditLog.find({ organization: organization._id })
        .sort({ createdAt: -1 })
        .populate("user", "fullName email"),
      UserSettings.findOne({ user: user._id }),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: { id: user._id.toString(), fullName: user.fullName, email: user.email },
    organization: toPublicOrganization(organization, req.membership?.role ?? "member"),
    platforms: platforms.map(toPublicPlatform),
    platformConnections: connections.map(toPublicPlatformConnection),
    billingRecords: billingRecords.map(toPublicBilling),
    creditTransactions: creditTransactions.map(toPublicCreditTransaction),
    auditLog: auditLog.map(toPublicAuditLog),
    // `toPublicUserSettings` already handles a missing document (returns
    // the real defaults with a null id), so no `? :` wrapper is needed here.
    userSettings: toPublicUserSettings(userSettings),
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="billing-manager-export-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.send(JSON.stringify(payload, null, 2));
});
