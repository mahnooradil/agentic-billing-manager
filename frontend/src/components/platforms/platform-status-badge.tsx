import { cn } from "@/lib/utils";
import type { PlatformStatus } from "@/services/types/platform";

/** Small pill showing a platform's Active/Inactive status. */
export function PlatformStatusBadge({ status }: { status: PlatformStatus }) {
  const active = status === "Active";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        active
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-emerald-500" : "bg-muted-foreground/50"
        )}
      />
      {status}
    </span>
  );
}
