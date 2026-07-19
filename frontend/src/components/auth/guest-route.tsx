"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { SessionLoading } from "./session-loading";

/**
 * Guards guest-only pages (/login, /register). While the session restores it
 * shows a loader; once ready, already-authenticated users are redirected to
 * the dashboard.
 */
export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard/overview");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || isAuthenticated) {
    return <SessionLoading />;
  }

  return <>{children}</>;
}
