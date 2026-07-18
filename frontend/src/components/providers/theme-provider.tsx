"use client";

/**
 * Thin wrapper around next-themes so the rest of the app imports a single,
 * project-owned ThemeProvider. Enables class-based light/dark switching that
 * matches the `.dark` variant defined in globals.css.
 */
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
