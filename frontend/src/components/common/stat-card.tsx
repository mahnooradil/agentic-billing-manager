import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  /** Small secondary line below the value (e.g. a hint or trend caption). */
  hint?: string;
  className?: string;
}

/**
 * Presentational KPI tile. Values are passed in by the caller — this component
 * holds no data logic and makes no requests.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "group hover-lift relative isolate overflow-hidden",
        className
      )}
    >
      {/* Soft brand wash that intensifies on hover. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-brand-gradient opacity-[0.07] blur-2xl transition-opacity duration-500 group-hover:opacity-20"
      />
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-primary-foreground shadow-e1 ring-1 ring-white/15 transition-transform duration-300 group-hover:scale-105">
            <Icon className="size-5" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
