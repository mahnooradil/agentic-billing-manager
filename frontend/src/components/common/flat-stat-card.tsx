import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type FlatStatTone = "neutral" | "primary" | "success" | "warning" | "danger";

const TONE_STYLES: Record<FlatStatTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
};

interface FlatStatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: FlatStatTone;
  /** Small clarifying line under the value (e.g. what the figure includes). */
  hint?: string;
  className?: string;
}

/**
 * Flat, static KPI tile — no gradient glow, no hover motion. The professional,
 * calm alternative to `StatCard` used across Billing and Analytics.
 */
export function FlatStatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  className,
}: FlatStatCardProps) {
  return (
    <Card className={className}>
      <div className="flex items-center gap-3.5 p-5">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            TONE_STYLES[tone]
          )}
        >
          <Icon className="size-5.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <p className="truncate font-heading text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {hint ? (
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
