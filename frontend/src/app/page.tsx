import { redirect } from "next/navigation";

/**
 * Root route. Per Phase 4 scope this simply redirects to the login screen.
 * NOTE: this is a static redirect only — no authentication is wired up.
 */
export default function RootPage() {
  redirect("/login");
}
