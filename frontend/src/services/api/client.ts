/**
 * Reusable, typed HTTP client. Single source of fetch logic so services never
 * duplicate request/parse/error handling.
 *
 * Auth: pass `auth: true` (or use the `api.*` helpers) to automatically attach
 * `Authorization: Bearer <JWT>` from the session store. Components must never
 * attach tokens themselves.
 *
 * 401 handling: when an *authenticated* request is rejected with 401, the
 * central unauthorized handler runs (clear session → logout → redirect). Public
 * requests (e.g. a failed login) are left alone so they can show their error.
 *
 * Error strategy: every failure surfaces as an `ApiError` with a safe,
 * user-presentable message plus optional field-level `errors`. Raw
 * exceptions/stack traces are never propagated to the UI.
 */
import { API_BASE_URL } from "./config";
import { notifyUnauthorized } from "./unauthorized-handler";
import { authStore } from "@/services/auth/auth-store";
import { emitClientEvent } from "@/services/events/client-events";
import type { ApiErrorBody } from "@/services/types/api";

export class ApiError extends Error {
  readonly status: number;
  readonly errors?: string[];

  constructor(message: string, status: number, errors?: string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Attach the stored JWT and enable central 401 handling for this request. */
  auth?: boolean;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR =
  "Unable to reach the server. Please check your connection and try again.";
const SESSION_EXPIRED = "Your session has expired. Please sign in again.";

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, signal, auth = false } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = authStore.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    // Network failure, DNS, CORS, server down — never a stack trace to the UI.
    throw new ApiError(NETWORK_ERROR, 0);
  }

  // Tolerate empty/non-JSON bodies without throwing.
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // An authenticated request rejected with 401 means the session is no longer
    // valid → run the central logout/redirect exactly once, here.
    if (response.status === 401 && auth) {
      notifyUnauthorized();
      throw new ApiError(SESSION_EXPIRED, 401);
    }

    const errorBody = (payload ?? {}) as Partial<ApiErrorBody>;
    const message =
      typeof errorBody.message === "string" && errorBody.message.length > 0
        ? errorBody.message
        : GENERIC_ERROR;
    const errors = Array.isArray(errorBody.errors) ? errorBody.errors : undefined;
    throw new ApiError(message, response.status, errors);
  }

  // A successful mutation to a protected business endpoint may have produced a
  // notification on the backend. Signal the Notification Store to refresh
  // instantly (F2.1) — excluding the notification/auth endpoints themselves to
  // avoid feedback loops. This is the WS-free "instant on your own action" path.
  if (
    auth &&
    method !== "GET" &&
    !path.startsWith("/notifications") &&
    !path.startsWith("/auth")
  ) {
    emitClientEvent("data:mutated");
  }

  return payload as T;
}

/** Per-call options for the authenticated helpers. */
interface AuthedRequestOptions {
  signal?: AbortSignal;
}

/**
 * Reusable authenticated request helpers. Every method attaches the Bearer
 * token and shares `apiRequest` — no duplicated fetch logic. This is the entry
 * point services should use for protected endpoints.
 */
export const api = {
  get: <T>(path: string, options?: AuthedRequestOptions): Promise<T> =>
    apiRequest<T>(path, { method: "GET", auth: true, signal: options?.signal }),

  post: <T>(path: string, body?: unknown, options?: AuthedRequestOptions): Promise<T> =>
    apiRequest<T>(path, { method: "POST", body, auth: true, signal: options?.signal }),

  put: <T>(path: string, body?: unknown, options?: AuthedRequestOptions): Promise<T> =>
    apiRequest<T>(path, { method: "PUT", body, auth: true, signal: options?.signal }),

  patch: <T>(path: string, body?: unknown, options?: AuthedRequestOptions): Promise<T> =>
    apiRequest<T>(path, { method: "PATCH", body, auth: true, signal: options?.signal }),

  delete: <T>(path: string, options?: AuthedRequestOptions): Promise<T> =>
    apiRequest<T>(path, { method: "DELETE", auth: true, signal: options?.signal }),
};
