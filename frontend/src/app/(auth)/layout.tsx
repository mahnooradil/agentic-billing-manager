import { Sparkles, Zap, LineChart, ShieldCheck } from "lucide-react";

import { GuestRoute } from "@/components/auth/guest-route";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { siteConfig } from "@/config/site";

const highlights = [
  {
    icon: Zap,
    title: "Autonomous insights",
    desc: "AI reads your usage and shows exactly where to cut spend.",
  },
  {
    icon: LineChart,
    title: "Every platform, one view",
    desc: "Connect thousands of services and track billing in real time.",
  },
  {
    icon: ShieldCheck,
    title: "Encrypted by default",
    desc: "Keys and tokens are encrypted at rest — never exposed.",
  },
];

/**
 * Premium split-screen auth shell: an animated aurora brand panel beside the
 * form. Guarded so already-authenticated users are sent to the dashboard.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <GuestRoute>
      <div className="relative min-h-svh lg:grid lg:grid-cols-2">
        {/* Brand panel — desktop only. */}
        <aside className="relative hidden overflow-hidden bg-brand-gradient p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:p-14">
          {/* Ambient motion + dotted texture. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="animate-aurora absolute -top-24 -left-20 size-96 rounded-full bg-white/20 blur-3xl" />
            <div className="animate-float absolute -right-16 bottom-0 size-96 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />
          </div>

          <div className="relative flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <Sparkles className="size-5" />
            </span>
            <span className="font-heading text-base font-semibold tracking-tight">
              {siteConfig.name}
            </span>
          </div>

          <div className="relative max-w-md space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">
                AI Billing, Automated
              </p>
              <h1 className="font-heading text-4xl leading-[1.1] font-semibold text-balance xl:text-5xl">
                Bill smarter. Spend less. Automate the rest.
              </h1>
              <p className="text-base text-white/80">
                One intelligent workspace for every platform you&apos;re billed
                on — with an AI copilot that watches the numbers for you.
              </p>
            </div>

            <ul className="space-y-4">
              {highlights.map((h) => {
                const Icon = h.icon;
                return (
                  <li key={h.title} className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
                      <Icon className="size-5" />
                    </span>
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold">{h.title}</p>
                      <p className="text-sm text-white/70">{h.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="relative text-sm text-white/60">
            Encrypted credentials · real connections · autonomous insights.
          </p>
        </aside>

        {/* Form column. */}
        <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 p-6">
          <div className="absolute top-4 right-4">
            <ThemeToggle />
          </div>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </GuestRoute>
  );
}
