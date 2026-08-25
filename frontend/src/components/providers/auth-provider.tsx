"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AuthContext, type AuthContextValue } from "@/context/auth-context";
import { authStore } from "@/services/auth/auth-store";
import { setUnauthorizedHandler } from "@/services/api/unauthorized-handler";
import { agentChatStore } from "@/services/agent/agent-chat-store";
import { invalidatePageCache } from "@/lib/page-data-cache";
import { getUserSettings } from "@/services/settings/settings.service";
import { LANDING_PAGE_PATHS } from "@/services/types/settings";
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
    async (token: string, user: AuthUser, redirectTo?: string) => {
      authStore.setSession(token, user);
      // Force the agent chat store to re-hydrate under this user's own storage
      // key — otherwise a same-tab account switch could still show the
      // previous user's in-memory transcript for a moment before any storage read.
      agentChatStore.reset();
      // Same reasoning for the dashboard page-data cache — a same-tab account
      // switch must never show the previous account's cached Billing/Platform data.
      invalidatePageCache();

      // An explicit redirect (e.g. back to an invite page) always wins —
      // otherwise fall back to the user's preferred landing page, or the
      // dashboard overview if that settings fetch fails for any reason.
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }
      let destination = "/dashboard/overview";
      try {
        const response = await getUserSettings();
        destination = LANDING_PAGE_PATHS[response.data.settings.general.defaultLandingPage];
      } catch {
        // Keep the default destination.
      }
      router.replace(destination);
    },
    [router]
  );

  const logout = React.useCallback(() => {
    authStore.clearSession();
    agentChatStore.reset();
    invalidatePageCache();
    router.replace("/login");
  }, [router]);

  // Let the API client trigger logout centrally on a 401 from an authed request.
  React.useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const onWorkspaceSwitched = React.useCallback(() => {
    // Same reasoning as login's same-tab account switch: every cached
    // Billing/Platform/etc. view and the agent chat transcript belonged to
    // the PREVIOUS workspace — none of it may leak into the new one.
    agentChatStore.reset();
    invalidatePageCache();
    router.replace("/dashboard/overview");
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
      onWorkspaceSwitched,
    }),
    [snapshot, login, logout, onWorkspaceSwitched]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
