/**
 * Small reusable lookup: several background engines (Recommendation,
 * Notification, credit scheduler) and agent tools receive only a userId
 * (events predate Organizations and are unchanged to minimize churn; agent
 * tools run against whichever workspace the chatting user is currently in)
 * but need the organization to scope their own queries.
 *
 * A user can belong to several organizations now — this resolves to their
 * CURRENT one (`User.activeOrganizationId`), the same org `auth.middleware.ts`
 * attaches to a live request, so a background job never touches a different
 * workspace than what that user is actually looking at. Falls back to any
 * membership they hold if the active pointer is unset/stale, mirroring the
 * middleware's own fallback — this function never bootstraps a new
 * organization itself, that stays the middleware's job for a live request.
 */
import { Types } from "mongoose";

import { User } from "@/models/user.model";
import { Membership } from "@/models/membership.model";

export async function getOrganizationIdForUser(
  userId: string | Types.ObjectId
): Promise<Types.ObjectId | null> {
  const user = await User.findById(userId).select("activeOrganizationId");
  if (user?.activeOrganizationId) {
    const membership = await Membership.findOne({
      user: userId,
      organization: user.activeOrganizationId,
    });
    if (membership) return membership.organization;
  }

  const membership = await Membership.findOne({ user: userId }).sort({ createdAt: 1 });
  return membership?.organization ?? null;
}
