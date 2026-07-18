/**
 * Authentication service — thin, typed wrappers over the existing Phase 3
 * backend endpoints. No token storage, no side effects: these functions only
 * make the request and return the typed response.
 */
import { apiRequest } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  LoginData,
  LoginPayload,
  RegisterData,
  RegisterPayload,
} from "@/services/types/auth";

/** POST /auth/register */
export function registerUser(
  payload: RegisterPayload
): Promise<ApiSuccess<RegisterData>> {
  return apiRequest<ApiSuccess<RegisterData>>("/auth/register", {
    method: "POST",
    body: payload,
  });
}

/** POST /auth/login */
export function loginUser(
  payload: LoginPayload
): Promise<ApiSuccess<LoginData>> {
  return apiRequest<ApiSuccess<LoginData>>("/auth/login", {
    method: "POST",
    body: payload,
  });
}
