"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { SessionLoading } from "./session-loading";

/**
 * Guards authenticated areas (e.g. /dashboard/*). While the session restores it
 * shows a loader; once ready, unauthenticated users are redirected to /login.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Loader covers both restore-in-progress and the brief redirecting window.
  if (isLoading || !isAuthenticated) {
    return <SessionLoading />;
  }

  return <>{children}</>;
}
