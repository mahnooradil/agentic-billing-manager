/**
 * Auth domain types shared between the service layer and the UI.
 * Dates arrive as ISO strings over JSON.
 */
export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  profilePicture?: string;
  createdAt: string;
  updatedAt: string;
}

/** Request payloads (only what the backend expects — no confirm fields). */
export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/** Response `data` shapes returned by the backend auth endpoints. */
export interface RegisterData {
  user: AuthUser;
}

export interface LoginData {
  token: string;
  user: AuthUser;
}
