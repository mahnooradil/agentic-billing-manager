/**
 * Organization/Team domain types — mirrors the backend's PublicOrganization /
 * PublicMember / PublicInvitation shapes. Dates arrive as ISO strings over JSON.
 */
export type MembershipRole = "owner" | "admin" | "member";
/** An invite can only grant admin/member — never owner. */
export type InvitableRole = "admin" | "member";

export interface Organization {
  id: string;
  name: string;
  planTier: "Free" | "Pro" | "Business";
  role: MembershipRole;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  role: MembershipRole;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
  createdAt: string;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  id: string;
  email: string;
  role: MembershipRole;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
}

/** Response `data` shape for `GET /organization`. */
export interface OrganizationData {
  organization: Organization;
}

/** Response `data` shape for `GET /organization/members`. */
export interface MembersData {
  members: Member[];
  pendingInvitations: Invitation[];
}

export interface UpdateOrganizationPayload {
  name: string;
}

export interface CreateInvitationPayload {
  email: string;
  role: InvitableRole;
}

export interface UpdateMemberRolePayload {
  role: InvitableRole;
}

/** Response `data` shape for the public `GET /invitations/:token` preview. */
export interface InvitationPreview {
  email: string;
  role: MembershipRole;
  organizationName: string;
  inviterName: string;
  hasExistingAccount: boolean;
}

/** One organization the caller belongs to, as returned by
 *  `GET /auth/organizations` (see auth.service.ts) — a user can belong to
 *  more than one now, so this list is how the workspace switcher populates. */
export interface MyOrganization extends Organization {
  isActive: boolean;
}

export interface MyOrganizationsData {
  organizations: MyOrganization[];
}

export interface SwitchOrganizationPayload {
  organizationId: string;
}

export interface SwitchOrganizationData {
  organization: Organization;
}
