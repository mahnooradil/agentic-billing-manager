import { DashboardShell } from "@/components/layout/dashboard-shell";

/** Wraps all /dashboard routes in the app shell (sidebar + navbar + footer). */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DashboardShell>{children}</DashboardShell>;
}
