/**
 * Reusable, typed HTTP client. Single source of fetch logic so services never
 * duplicate request/parse/error handling.
 *
 * Error strategy: every failure surfaces as an `ApiError` with a safe,
 * user-presentable message (from the backend's `message`, or a generic
 * fallback) plus optional field-level `errors`. Raw exceptions/stack traces
 * are never propagated to the UI.
 */
import { API_BASE_URL } from "./config";
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
}

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR =
  "Unable to reach the server. Please check your connection and try again.";

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
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
    const errorBody = (payload ?? {}) as Partial<ApiErrorBody>;
    const message =
      typeof errorBody.message === "string" && errorBody.message.length > 0
        ? errorBody.message
        : GENERIC_ERROR;
    const errors = Array.isArray(errorBody.errors) ? errorBody.errors : undefined;
    throw new ApiError(message, response.status, errors);
  }

  return payload as T;
}
