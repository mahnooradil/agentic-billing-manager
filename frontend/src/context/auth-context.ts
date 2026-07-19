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
  /** Persist a session and navigate to the dashboard. */
  login: (token: string, user: AuthUser) => void;
  /** Clear the session and navigate to login. */
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
