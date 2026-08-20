import { api, apiRequest } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  OrganizationData,
  MembersData,
  UpdateOrganizationPayload,
  CreateInvitationPayload,
  UpdateMemberRolePayload,
  InvitationPreview,
} from "@/services/types/organization";

/** GET /organization — the caller's organization + their role in it. */
export function getMyOrganization(): Promise<ApiSuccess<OrganizationData>> {
  return api.get<ApiSuccess<OrganizationData>>("/organization");
}

/** PATCH /organization — rename the organization (owner/admin only). */
export function updateMyOrganization(
  payload: UpdateOrganizationPayload
): Promise<ApiSuccess<OrganizationData>> {
  return api.patch<ApiSuccess<OrganizationData>>("/organization", payload);
}

/** GET /organization/members — every member + every pending invitation. */
export function getMembers(): Promise<ApiSuccess<MembersData>> {
  return api.get<ApiSuccess<MembersData>>("/organization/members");
}

/** PATCH /organization/members/:id — change a member's role (owner only). */
export function updateMemberRole(
  id: string,
  payload: UpdateMemberRolePayload
): Promise<ApiSuccess<{ member: MembersData["members"][number] }>> {
  return api.patch(`/organization/members/${id}`, payload);
}

/** DELETE /organization/members/:id — remove a member (owner/admin only). */
export function removeMember(id: string): Promise<ApiSuccess<{ id: string }>> {
  return api.delete(`/organization/members/${id}`);
}

/** POST /organization/invitations — invite by email (owner/admin only). */
export function createInvitation(
  payload: CreateInvitationPayload
): Promise<ApiSuccess<{ invitation: MembersData["pendingInvitations"][number] }>> {
  return api.post("/organization/invitations", payload);
}

/** DELETE /organization/invitations/:id — revoke a pending invite. */
export function revokeInvitation(id: string): Promise<ApiSuccess<{ id: string }>> {
  return api.delete(`/organization/invitations/${id}`);
}

/** GET /invitations/:token — PUBLIC preview, no auth required. */
export function previewInvitation(token: string): Promise<ApiSuccess<InvitationPreview>> {
  return apiRequest<ApiSuccess<InvitationPreview>>(`/invitations/${token}`);
}

/** POST /invitations/:token/accept — authenticated accept (existing account). */
export function acceptInvitation(token: string): Promise<ApiSuccess<OrganizationData>> {
  return api.post<ApiSuccess<OrganizationData>>(`/invitations/${token}/accept`);
}
