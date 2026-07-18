/**
 * Shared API envelope types. These mirror the backend's response contract:
 *   success -> { success: true, message?, data }
 *   error   -> { success: false, message, errors? }
 */
export interface ApiSuccess<T> {
  success: true;
  message?: string;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  errors?: string[];
}
