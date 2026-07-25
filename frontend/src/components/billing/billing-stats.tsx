import { CircleCheck, Clock, Receipt, TriangleAlert, Wallet } from "lucide-react";

import { StatCard } from "@/components/common/stat-card";
import { formatNumber } from "@/lib/format";
import type { BillingStats } from "@/services/types/billing";

interface BillingStatsGridProps {
  stats: BillingStats;
}

/**
 * Billing dashboard KPI row. Reuses the shared StatCard so it matches the
 * overview dashboard. Counts come from the backend (all records, not the
 * filtered view). Revenue is the sum of paid invoice amounts, formatted via the
 * shared formatting layer (currency-agnostic — it can span multiple currencies).
 */
export function BillingStatsGrid({ stats }: BillingStatsGridProps) {
  const cards = [
    { label: "Total Records", value: String(stats.totalRecords), hint: "All invoices", icon: Receipt },
    { label: "Paid", value: String(stats.paidRecords), hint: "Settled invoices", icon: CircleCheck },
    { label: "Pending", value: String(stats.pendingRecords), hint: "Awaiting payment", icon: Clock },
    { label: "Overdue", value: String(stats.overdueRecords), hint: "Past due", icon: TriangleAlert },
    { label: "Total Revenue", value: formatNumber(stats.totalRevenue), hint: "Paid only", icon: Wallet },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={card.value}
          hint={card.hint}
          icon={card.icon}
        />
      ))}
    </div>
  );
}
