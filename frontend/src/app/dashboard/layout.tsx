import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardShell } from "@/components/layout/dashboard-shell";

/**
 * Wraps all /dashboard routes in the auth guard + app shell (sidebar + navbar
 * + footer). Unauthenticated users are redirected to /login by ProtectedRoute.
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProtectedRoute>
      <DashboardShell>{children}</DashboardShell>
    </ProtectedRoute>
  );
}
