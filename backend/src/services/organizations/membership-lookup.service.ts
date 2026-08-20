/**
 * Small reusable lookup: several background engines (Recommendation,
 * Notification) receive only a userId from the event bus (events predate
 * Organizations and are unchanged to minimize churn) but need the
 * organization to scope their own queries. v1: one Membership per user, so
 * this is a single findOne, not a real multi-org resolution.
 */
import { Types } from "mongoose";

import { Membership } from "@/models/membership.model";

export async function getOrganizationIdForUser(
  userId: string | Types.ObjectId
): Promise<Types.ObjectId | null> {
  const membership = await Membership.findOne({ user: userId });
  return membership?.organization ?? null;
}
