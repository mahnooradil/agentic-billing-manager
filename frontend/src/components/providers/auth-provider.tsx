"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AuthContext, type AuthContextValue } from "@/context/auth-context";
import { authStore } from "@/services/auth/auth-store";
import type { AuthUser } from "@/services/types/auth";

/**
 * Provides authentication state + actions to the whole app. Reads the session
 * from the external auth store (restored once from localStorage) and exposes
 * `login`/`logout` which persist, update state, and handle navigation.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const snapshot = React.useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot
  );

  const login = React.useCallback(
    (token: string, user: AuthUser) => {
      authStore.setSession(token, user);
      router.replace("/dashboard/overview");
    },
    [router]
  );

  const logout = React.useCallback(() => {
    authStore.clearSession();
    router.replace("/login");
  }, [router]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user: snapshot.user,
      token: snapshot.token,
      isAuthenticated:
        snapshot.status === "ready" && Boolean(snapshot.token && snapshot.user),
      isLoading: snapshot.status === "loading",
      login,
      logout,
    }),
    [snapshot, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
