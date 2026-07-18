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
      className={cn("flex items-center gap-2 px-3", className)}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
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
