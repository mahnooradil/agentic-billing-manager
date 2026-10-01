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
  // WP-3 — revenue is per-currency now (never one bare number added across
  // currencies). The highest-total currency headlines the card; if more than
  // one currency has Paid revenue, the hint says so explicitly instead of
  // silently hiding the rest.
  const primaryRevenue = stats.revenueByCurrency[0] ?? null;
  const otherCurrencyCount = Math.max(0, stats.revenueByCurrency.length - 1);
  const revenueHint =
    otherCurrencyCount > 0
      ? `Paid invoices in ${primaryRevenue?.currency} + ${otherCurrencyCount} more ${
          otherCurrencyCount === 1 ? "currency" : "currencies"
        }`
      : "Sum of Paid invoices";

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
      label: primaryRevenue ? `Total Revenue (${primaryRevenue.currency})` : "Total Revenue",
      value: formatNumber(primaryRevenue?.total ?? 0),
      icon: Wallet,
      tone: "primary",
      hint: revenueHint,
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
