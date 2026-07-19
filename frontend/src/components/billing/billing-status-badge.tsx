import { cn } from "@/lib/utils";
import type { BillingStatus } from "@/services/types/billing";

/** Per-status pill styles (matches the Platform status badge conventions). */
const STATUS_STYLES: Record<BillingStatus, { pill: string; dot: string }> = {
  Paid: {
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  Pending: {
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  Overdue: {
    pill: "bg-red-500/10 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
};

/** Small pill showing a billing record's Pending/Paid/Overdue status. */
export function BillingStatusBadge({ status }: { status: BillingStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        style.pill
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {status}
    </span>
  );
}
