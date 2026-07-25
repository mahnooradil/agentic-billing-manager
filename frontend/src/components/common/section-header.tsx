import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

/** Smaller header used to title a section within a page. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-2.5 font-heading text-lg font-medium tracking-tight">
          <span
            aria-hidden
            className="h-4 w-1 shrink-0 rounded-full bg-brand-gradient"
          />
          {title}
        </h2>
        {description ? (
          <p className="pl-3.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
