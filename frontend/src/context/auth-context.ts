"use client";

import { createContext } from "react";

import type { AuthUser } from "@/services/types/auth";

/** Public shape of the authentication context. */
export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  /** True while the session is being restored from storage on first load. */
  isLoading: boolean;
  /** Persist a session and navigate — to `redirectTo` if given (e.g. back to
   *  an invite page after logging in from there), otherwise the user's usual
   *  landing page. */
  login: (token: string, user: AuthUser, redirectTo?: string) => void;
  /** Clear the session and navigate to login. */
  logout: () => void;
  /** Call AFTER the switch-organization request itself succeeds — clears
   *  every cached business-data view (and the agent chat transcript) so
   *  nothing from the previous workspace lingers, then lands on Overview. */
  onWorkspaceSwitched: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
