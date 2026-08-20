/**
 * Organization bootstrap — creates a brand-new personal Organization + Owner
 * Membership for a user. Used in two places: new signups (auth.controller.ts's
 * verifyOtp) and the one-time backfill for accounts that existed before
 * Organizations did (see the backfill note in the Membership model). Every
 * account ends up owning exactly its own organization unless/until it accepts
 * an invite into someone else's (see services/organizations/invitation.service.ts).
 */
import type { Types } from "mongoose";

import { Organization, type OrganizationDocument } from "@/models/organization.model";
import { Membership, type MembershipDocument } from "@/models/membership.model";

/** Creates a personal Organization for `userId` and makes them its Owner.
 *  Caller's responsibility to ensure this user doesn't already have a
 *  Membership (the `unique: true` on Membership.user would throw otherwise). */
export async function createPersonalOrganization(
  userId: Types.ObjectId | string,
  fullName: string
): Promise<{ organization: OrganizationDocument; membership: MembershipDocument }> {
  const organization = await Organization.create({
    name: `${fullName}'s Workspace`,
    planTier: "Free",
  });
  const membership = await Membership.create({
    user: userId,
    organization: organization._id,
    role: "owner",
  });
  return { organization, membership };
}
