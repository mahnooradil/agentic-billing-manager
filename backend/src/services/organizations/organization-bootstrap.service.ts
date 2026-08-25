/**
 * Organization bootstrap — creates a brand-new personal Organization + Owner
 * Membership for a user. Used in a few places: new signups (auth.controller.ts's
 * verifyOtp), the one-time backfill for accounts that existed before
 * Organizations did (see the backfill note in the Membership model), and
 * `ensureOwnerHasPersonalWorkspace` below (paired with
 * `cleanupRedundantFallbackWorkspace`, its reverse).
 */
import type { Types } from "mongoose";

import { Organization, type OrganizationDocument } from "@/models/organization.model";
import { Membership, type MembershipDocument } from "@/models/membership.model";
import { Billing } from "@/models/billing.model";
import { Platform } from "@/models/platform.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Notification } from "@/models/notification.model";
import { Recommendation } from "@/models/recommendation.model";
import { CreditTransaction } from "@/models/credit-transaction.model";
import { User } from "@/models/user.model";
import { grantCredits } from "@/services/credits/credit-ledger.service";
import { STARTING_CREDITS } from "@/config/credits";

/** Creates a personal Organization for `userId` and makes them its Owner.
 *  A user may already hold other Memberships — that's fine, a Membership is
 *  only unique per (user, organization) pair now, not one-per-user. Accepts
 *  an explicit `workspaceName` for callers (like
 *  `ensureOwnerHasPersonalWorkspace` below) creating a SECOND organization
 *  for someone who already has one named the default way — otherwise the
 *  switcher would show two identically-named entries with no way to tell
 *  them apart. `isFallbackPersonal` marks it as eligible for
 *  `cleanupRedundantFallbackWorkspace` later — never set for a signup or
 *  otherwise deliberately-created workspace. */
export async function createPersonalOrganization(
  userId: Types.ObjectId | string,
  fullName: string,
  workspaceName?: string,
  isFallbackPersonal = false
): Promise<{ organization: OrganizationDocument; membership: MembershipDocument }> {
  const organization = await Organization.create({
    name: workspaceName ?? `${fullName}'s Workspace`,
    planTier: "Free",
    isFallbackPersonal,
  });
  const membership = await Membership.create({
    user: userId,
    organization: organization._id,
    role: "owner",
  });
  return { organization, membership };
}

/**
 * Guarantees `userId` owns at least one organization of their own — creating
 * a fresh personal one (with its own starting credit grant, same as a new
 * signup) if their only organization right now is `excludingOrgId`.
 *
 * Called whenever someone's ORIGINAL workspace gains its first outside
 * member (see invitation.service.ts): inviting someone into your own
 * workspace turns it into a shared one, and without this you'd be left with
 * no private workspace of your own — every user, owner or invited member
 * alike, keeps one. Marks the new workspace `isFallbackPersonal` so it can
 * be cleaned up automatically later if it turns out not to be needed after
 * all — see `cleanupRedundantFallbackWorkspace`.
 */
export async function ensureOwnerHasPersonalWorkspace(
  userId: Types.ObjectId | string,
  fullName: string,
  excludingOrgId: Types.ObjectId | string
): Promise<void> {
  const ownedElsewhere = await Membership.findOne({
    user: userId,
    role: "owner",
    organization: { $ne: excludingOrgId },
  });
  if (ownedElsewhere) return;

  const { organization } = await createPersonalOrganization(
    userId,
    fullName,
    `${fullName}'s Personal Workspace`,
    true
  );
  await grantCredits(organization._id, STARTING_CREDITS, "signup_grant", "grant", userId);
}

/**
 * The reverse of `ensureOwnerHasPersonalWorkspace` — call after removing a
 * member leaves an organization solo-owned again (see
 * organization.controller.ts's `removeMember`). If that owner is holding a
 * fallback personal workspace (`isFallbackPersonal: true`) that turned out
 * to never be used — no other members, no business data in it — it's
 * deleted outright, so a one-off invite-then-remove doesn't leave a
 * permanent, empty, redundant workspace cluttering their switcher forever.
 * Never touches a workspace without that flag, so a REAL personal
 * workspace (from signup, or one the user is actually using) is never at
 * risk. Best-effort — never throws, never blocks the removal itself.
 */
export async function cleanupRedundantFallbackWorkspace(
  userId: Types.ObjectId | string
): Promise<void> {
  try {
    const ownedMemberships = await Membership.find({ user: userId, role: "owner" });
    const fallbackOrgs = await Organization.find({
      _id: { $in: ownedMemberships.map((m) => m.organization) },
      isFallbackPersonal: true,
    });

    for (const org of fallbackOrgs) {
      const [otherMembers, billing, platforms, connections] = await Promise.all([
        Membership.countDocuments({ organization: org._id, user: { $ne: userId } }),
        Billing.countDocuments({ organization: org._id }),
        Platform.countDocuments({ organization: org._id }),
        PlatformConnection.countDocuments({ organization: org._id }),
      ]);
      if (otherMembers > 0 || billing > 0 || platforms > 0 || connections > 0) continue;

      await Promise.all([
        Membership.deleteMany({ organization: org._id }),
        Notification.deleteMany({ organization: org._id }),
        Recommendation.deleteMany({ organization: org._id }),
        CreditTransaction.deleteMany({ organization: org._id }),
        Organization.deleteOne({ _id: org._id }),
        // If this now-deleted org was the user's active one, clear the
        // pointer — the next request self-heals into whatever they have left.
        User.updateOne(
          { _id: userId, activeOrganizationId: org._id },
          { $unset: { activeOrganizationId: "" } }
        ),
      ]);
    }
  } catch {
    // Best-effort — see docstring.
  }
}
