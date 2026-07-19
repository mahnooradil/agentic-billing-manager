"use client";

import { useContext } from "react";

import { AuthContext } from "@/context/auth-context";

/** Access the auth context. Throws if used outside <AuthProvider>. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
