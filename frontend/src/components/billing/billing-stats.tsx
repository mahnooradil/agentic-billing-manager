import { CircleCheck, Clock, Receipt, TriangleAlert, Wallet } from "lucide-react";

import { FlatStatCard, type FlatStatTone } from "@/components/common/flat-stat-card";
import { formatNumber } from "@/lib/format";
import type { BillingStats } from "@/services/types/billing";

interface BillingStatsGridProps {
  stats: BillingStats;
}

/**
 * Billing KPI row — flat, static cards (no gradient glow, no hover motion),
 * each with a small color-coded icon badge so the five figures stay quick to
 * scan at a glance.
 */
export function BillingStatsGrid({ stats }: BillingStatsGridProps) {
  const cards: {
    label: string;
    value: string;
    icon: typeof Receipt;
    tone: FlatStatTone;
    hint: string;
  }[] = [
    {
      label: "Total Records",
      value: String(stats.totalRecords),
      icon: Receipt,
      tone: "neutral",
      hint: "All invoices, any status",
    },
    {
      label: "Paid",
      value: String(stats.paidRecords),
      icon: CircleCheck,
      tone: "success",
      hint: "Invoices marked Paid",
    },
    {
      label: "Pending",
      value: String(stats.pendingRecords),
      icon: Clock,
      tone: "warning",
      hint: "Awaiting payment",
    },
    {
      label: "Overdue",
      value: String(stats.overdueRecords),
      icon: TriangleAlert,
      tone: "danger",
      hint: "Past due, unpaid",
    },
    {
      label: "Total Revenue",
      value: formatNumber(stats.totalRevenue),
      icon: Wallet,
      tone: "primary",
      hint: "Sum of Paid invoices, all currencies",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <FlatStatCard key={card.label} {...card} />
      ))}
    </div>
  );
}
