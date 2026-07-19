import { GuestRoute } from "@/components/auth/guest-route";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Centered layout for the auth screens (login/register). Guarded so that
 * already-authenticated users are redirected to the dashboard.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <GuestRoute>
      <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Brand />
        {children}
      </div>
    </GuestRoute>
  );
}
