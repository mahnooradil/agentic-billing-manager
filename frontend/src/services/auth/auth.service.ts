/**
 * Authentication service — thin, typed wrappers over the passwordless backend
 * endpoints. No token storage, no side effects: these functions only make the
 * request and return the typed response.
 */
import { api, apiRequest } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  RequestRegisterOtpPayload,
  RequestLoginOtpPayload,
  VerifyOtpPayload,
  VerifyOtpData,
  UpdateProfilePayload,
  RequestEmailChangePayload,
  VerifyEmailChangePayload,
  AuthSession,
  AuthUser,
} from "@/services/types/auth";
import type {
  MyOrganizationsData,
  SwitchOrganizationPayload,
  SwitchOrganizationData,
} from "@/services/types/organization";

/** POST /auth/register/request-otp */
export function requestRegisterOtp(
  payload: RequestRegisterOtpPayload
): Promise<ApiSuccess<null>> {
  return apiRequest<ApiSuccess<null>>("/auth/register/request-otp", {
    method: "POST",
    body: payload,
  });
}

/** POST /auth/login/request-otp */
export function requestLoginOtp(
  payload: RequestLoginOtpPayload
): Promise<ApiSuccess<null>> {
  return apiRequest<ApiSuccess<null>>("/auth/login/request-otp", {
    method: "POST",
    body: payload,
  });
}

/** POST /auth/verify-otp — completes either flow and issues the session. */
export function verifyOtp(
  payload: VerifyOtpPayload
): Promise<ApiSuccess<VerifyOtpData>> {
  return apiRequest<ApiSuccess<VerifyOtpData>>("/auth/verify-otp", {
    method: "POST",
    body: payload,
  });
}

/** PATCH /auth/profile — update the authenticated user's display name. */
export function updateProfile(
  payload: UpdateProfilePayload
): Promise<ApiSuccess<{ user: AuthUser }>> {
  return api.patch<ApiSuccess<{ user: AuthUser }>>("/auth/profile", payload);
}

/** DELETE /auth/account — permanently deletes the account and all its data. */
export function deleteAccount(): Promise<ApiSuccess<null>> {
  return api.delete<ApiSuccess<null>>("/auth/account");
}

/** POST /auth/sign-out-everywhere — invalidates every other session's token
 *  and returns a fresh one so THIS session stays signed in. */
export function signOutEverywhere(): Promise<ApiSuccess<{ token: string }>> {
  return api.post<ApiSuccess<{ token: string }>>("/auth/sign-out-everywhere");
}

/** POST /auth/email/request-otp — sends a code to a NEW email to verify ownership. */
export function requestEmailChangeOtp(
  payload: RequestEmailChangePayload
): Promise<ApiSuccess<null>> {
  return api.post<ApiSuccess<null>>("/auth/email/request-otp", payload);
}

/** POST /auth/email/verify-otp — completes the change-email flow. */
export function verifyEmailChangeOtp(
  payload: VerifyEmailChangePayload
): Promise<ApiSuccess<{ user: AuthUser }>> {
  return api.post<ApiSuccess<{ user: AuthUser }>>("/auth/email/verify-otp", payload);
}

/** GET /auth/sessions — lists the caller's active login sessions. */
export function getSessions(): Promise<ApiSuccess<{ sessions: AuthSession[] }>> {
  return api.get<ApiSuccess<{ sessions: AuthSession[] }>>("/auth/sessions");
}

/** DELETE /auth/sessions/:id — revokes one session (signs that device out). */
export function revokeSession(id: string): Promise<ApiSuccess<null>> {
  return api.delete<ApiSuccess<null>>(`/auth/sessions/${id}`);
}

/** GET /auth/organizations — every organization the caller belongs to. */
export function getMyOrganizations(): Promise<ApiSuccess<MyOrganizationsData>> {
  return api.get<ApiSuccess<MyOrganizationsData>>("/auth/organizations");
}

/** POST /auth/switch-organization — makes another of the caller's own
 *  organizations the active one. */
export function switchOrganization(
  payload: SwitchOrganizationPayload
): Promise<ApiSuccess<SwitchOrganizationData>> {
  return api.post<ApiSuccess<SwitchOrganizationData>>("/auth/switch-organization", payload);
}
