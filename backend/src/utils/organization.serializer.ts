/**
 * Converts an Organization document (+ the requesting user's role in it)
 * into the wire shape.
 */
import type { OrganizationDocument } from "@/models/organization.model";
import type { MembershipRole } from "@/models/membership.model";
import type { PublicOrganization } from "@/types";

export function toPublicOrganization(
  organization: OrganizationDocument,
  role: MembershipRole
): PublicOrganization {
  return {
    id: organization._id.toString(),
    name: organization.name,
    planTier: organization.planTier,
    role,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}
