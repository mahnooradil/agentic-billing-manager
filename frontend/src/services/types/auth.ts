/**
 * Auth domain types shared between the service layer and the UI.
 * Passwordless: every request only ever carries an email (+ name, for the
 * register flow) or a 6-digit code. Dates arrive as ISO strings over JSON.
 */
export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  profilePicture?: string;
  createdAt: string;
  updatedAt: string;
}

/** Request payload for updating the display name (email is not editable here). */
export interface UpdateProfilePayload {
  fullName: string;
}

/** Request payloads. */
export interface RequestRegisterOtpPayload {
  fullName: string;
  email: string;
}

export interface RequestLoginOtpPayload {
  email: string;
}

export interface VerifyOtpPayload {
  email: string;
  code: string;
}

/** Response `data` shape for a completed verify — the session-issuing step. */
export interface VerifyOtpData {
  token: string;
  user: AuthUser;
}

/** Change-email flow: request a code at the new address, then verify it. */
export interface RequestEmailChangePayload {
  newEmail: string;
}

export interface VerifyEmailChangePayload {
  newEmail: string;
  code: string;
}

/** One active login session (Security tab). */
export interface AuthSession {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
}
