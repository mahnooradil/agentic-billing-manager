import Link from "next/link";
import { Sparkles } from "lucide-react";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

interface BrandProps {
  /** When collapsed, show only the logo mark (no wordmark). */
  collapsed?: boolean;
  className?: string;
}

/** App logo + wordmark, linking back to the dashboard home. */
export function Brand({ collapsed = false, className }: BrandProps) {
  return (
    <Link
      href="/dashboard/overview"
      className={cn("group flex items-center gap-2.5 px-3", className)}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-primary-foreground shadow-e1 ring-1 ring-white/15 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
        <Sparkles className="size-4" />
      </span>
      {!collapsed ? (
        <span className="font-heading text-sm font-semibold tracking-tight">
          {siteConfig.name}
        </span>
      ) : null}
    </Link>
  );
}
