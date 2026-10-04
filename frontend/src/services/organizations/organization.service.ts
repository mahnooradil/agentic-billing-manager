import { API_BASE_URL } from "@/services/api/config";
import { api, apiRequest, ApiError } from "@/services/api/client";
import { authStore } from "@/services/auth/auth-store";
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

/** GET /organization/export — WP-12: a full JSON export of everything the
 *  organization owns (platforms, connections, billing records, credit
 *  history, audit log) plus the caller's own settings, triggered as a file
 *  download — same pattern `billing.service.ts`'s CSV export already uses. */
export async function exportMyData(): Promise<void> {
  const token = authStore.getToken();
  const response = await fetch(`${API_BASE_URL}/organization/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new ApiError("Failed to export your data.", response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `billing-manager-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** GET /invitations/:token — PUBLIC preview, no auth required. */
export function previewInvitation(token: string): Promise<ApiSuccess<InvitationPreview>> {
  return apiRequest<ApiSuccess<InvitationPreview>>(`/invitations/${token}`);
}

/** POST /invitations/:token/accept — authenticated accept (existing account). */
export function acceptInvitation(token: string): Promise<ApiSuccess<OrganizationData>> {
  return api.post<ApiSuccess<OrganizationData>>(`/invitations/${token}/accept`);
}
