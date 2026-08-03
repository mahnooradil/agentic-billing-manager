import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

import type { StatusBreakdown, BillingStatus } from "@/services/types/analytics";

const STATUS_META: Record<
  BillingStatus,
  { icon: typeof CheckCircle2; iconClassName: string; barClassName: string }
> = {
  Paid: {
    icon: CheckCircle2,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    barClassName: "bg-emerald-500",
  },
  Pending: {
    icon: Clock,
    iconClassName: "text-amber-600 dark:text-amber-400",
    barClassName: "bg-amber-500",
  },
  Overdue: {
    icon: AlertCircle,
    iconClassName: "text-red-600 dark:text-red-400",
    barClassName: "bg-red-500",
  },
};

interface InvoiceStatusRowProps {
  data: StatusBreakdown[];
}

/** Invoice status counts — a plain icon + label + count row per status. */
export function InvoiceStatusRow({ data }: InvoiceStatusRowProps) {
  const total = data.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No history yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((row) => {
        const meta = STATUS_META[row.status];
        const Icon = meta.icon;
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
        return (
          <div key={row.status} className="flex items-center gap-3">
            <Icon className={`size-4 shrink-0 ${meta.iconClassName}`} />
            <span className="w-16 shrink-0 text-sm text-foreground">{row.status}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${meta.barClassName}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
              {row.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
