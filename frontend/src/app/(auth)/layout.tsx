import { GuestRoute } from "@/components/auth/guest-route";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Auth shell — a single centered column on a plain background, no split-
 * screen hero panel. Modeled on the simplicity of modern AI-app login
 * screens: just a logo, the step's content, and nothing else competing for
 * attention. Guarded so already-authenticated users are sent to the dashboard.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <GuestRoute>
      <div className="relative flex min-h-svh flex-col items-center justify-center gap-8 bg-background p-6">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Brand />
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </GuestRoute>
  );
}
