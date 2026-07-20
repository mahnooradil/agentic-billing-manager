"use client";

import * as React from "react";
import {
  BarChart3,
  Coins,
  Layers,
  Receipt,
  TrendingUp,
  Wallet,
  CircleCheck,
  CircleAlert,
  TriangleAlert,
  Info,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { StatCard } from "@/components/common/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api/client";
import { getAnalyticsOverview } from "@/services/analytics/analytics.service";
import type {
  AnalyticsInsight,
  AnalyticsOverview,
  AnalyticsRange,
} from "@/services/types/analytics";

type ViewStatus = "loading" | "error" | "ready";

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "3m", label: "3 mo" },
  { value: "6m", label: "6 mo" },
  { value: "12m", label: "12 mo" },
];

/** Formats an amount with its currency; falls back to a plain number + code. */
function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency}`;
  }
}

/** Turns a "YYYY-MM" key into a short label like "Jan 2026". */
function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

const INSIGHT_STYLES: Record<
  AnalyticsInsight["severity"],
  { icon: LucideIcon; className: string }
> = {
  warning: { icon: TriangleAlert, className: "text-destructive" },
  success: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  info: { icon: Info, className: "text-muted-foreground" },
};

/** A single labelled horizontal bar (width relative to `max`). */
function BarRow({
  label,
  caption,
  value,
  max,
}: {
  label: string;
  caption: string;
  value: number;
  max: number;
}) {
  // Keep a small minimum width so non-zero bars stay visible.
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 text-muted-foreground">{caption}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Analytics screen: fetches the composite analytics overview and renders KPIs,
 * per-currency totals, spend-by-platform and monthly-trend bars, a status
 * breakdown, and rule-based insights. Pure CSS/flex visualizations — no chart
 * library. Handles loading, error and empty (no billing data) states.
 */
export function AnalyticsView() {
  const [range, setRange] = React.useState<AnalyticsRange>("all");
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [data, setData] = React.useState<AnalyticsOverview | null>(null);
  const [loadError, setLoadError] = React.useState("");

  // Bumping reloadKey re-runs the fetch effect (used by the retry button).
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getAnalyticsOverview(range);
        if (ignore) return;
        setData(response.data.analytics);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Failed to load analytics."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [range, reloadKey]);

  const retry = () => {
    setStatus("loading");
    setReloadKey((key) => key + 1);
  };

  const rangeFilter = (
    <div className="flex flex-wrap items-center gap-1">
      {RANGE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={range === option.value ? "default" : "ghost"}
          onClick={() => setRange(option.value)}
          aria-pressed={range === option.value}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );

  const primaryTotal =
    data && data.primaryCurrency
      ? data.totalsByCurrency.find((c) => c.currency === data.primaryCurrency)
      : undefined;

  const maxPlatform = data
    ? Math.max(0, ...data.byPlatform.map((p) => p.total))
    : 0;
  const maxMonth = data
    ? Math.max(0, ...data.monthlyTrend.map((m) => m.total))
    : 0;

  return (
    <PageWrapper>
      <PageHeader
        title="Analytics"
        description="Spending insights across your platforms and invoices."
        actions={status === "ready" && data && data.invoiceCount > 0 ? rangeFilter : undefined}
      />

      {status === "loading" ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner label="Loading analytics…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : data && data.invoiceCount === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics yet"
          description="Add billing records to see spending insights, trends and breakdowns here."
        />
      ) : data ? (
        <div className="space-y-8">
          {/* Headline KPIs (money in the primary currency). */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Invoices"
              value={String(data.invoiceCount)}
              hint="In selected range"
              icon={Receipt}
            />
            <StatCard
              label={`Total Spend${primaryTotal ? ` (${primaryTotal.currency})` : ""}`}
              value={primaryTotal ? formatMoney(primaryTotal.total, primaryTotal.currency) : "—"}
              hint="Primary currency"
              icon={Wallet}
            />
            <StatCard
              label="Paid"
              value={primaryTotal ? formatMoney(primaryTotal.paid, primaryTotal.currency) : "—"}
              hint="Settled invoices"
              icon={CircleCheck}
            />
            <StatCard
              label="Outstanding"
              value={
                primaryTotal ? formatMoney(primaryTotal.outstanding, primaryTotal.currency) : "—"
              }
              hint="Pending + overdue"
              icon={CircleAlert}
            />
          </div>

          {/* Insights (rule-based, no AI). */}
          {data.insights.length > 0 ? (
            <section className="space-y-4">
              <SectionHeader
                title="Insights"
                description="Automatically derived from your billing data."
              />
              <Card>
                <CardContent className="space-y-3">
                  {data.insights.map((insight) => {
                    const style = INSIGHT_STYLES[insight.severity];
                    const Icon = style.icon;
                    return (
                      <div key={insight.id} className="flex items-start gap-3">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", style.className)} />
                        <p className="text-sm">{insight.message}</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </section>
          ) : null}

          {/* Per-currency totals (authoritative — never summed across currencies). */}
          <section className="space-y-4">
            <SectionHeader
              title="Totals by currency"
              description="Amounts are grouped per currency and never combined."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.totalsByCurrency.map((c) => (
                <Card key={c.currency}>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-heading text-base font-medium">
                        <Coins className="size-4 text-muted-foreground" />
                        {c.currency}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.count} invoice{c.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="font-heading text-xl font-semibold tracking-tight">
                      {formatMoney(c.total, c.currency)}
                    </p>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Paid {formatMoney(c.paid, c.currency)}</span>
                      <span>Outstanding {formatMoney(c.outstanding, c.currency)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Status breakdown (counts, currency-agnostic). */}
          <section className="space-y-4">
            <SectionHeader title="Invoice status" description="Count of invoices by status." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {data.byStatus.map((s) => (
                <StatCard
                  key={s.status}
                  label={s.status}
                  value={String(s.count)}
                  icon={
                    s.status === "Paid"
                      ? CircleCheck
                      : s.status === "Overdue"
                        ? TriangleAlert
                        : CircleAlert
                  }
                />
              ))}
            </div>
          </section>

          {/* Spend by platform (primary currency). */}
          <section className="space-y-4">
            <SectionHeader
              title="Spend by platform"
              description={
                primaryTotal
                  ? `Top platforms by ${primaryTotal.currency} spend.`
                  : "Top platforms by spend."
              }
            />
            {data.byPlatform.length > 0 ? (
              <Card>
                <CardContent className="space-y-4">
                  {data.byPlatform.map((p) => (
                    <BarRow
                      key={p.platformId || p.slug || p.name}
                      label={p.name}
                      caption={`${formatMoney(p.total, p.currency)} · ${p.count}`}
                      value={p.total}
                      max={maxPlatform}
                    />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={Layers}
                title="No platform spend"
                description="No invoices in the primary currency for this range."
              />
            )}
          </section>

          {/* Monthly trend (primary currency). */}
          <section className="space-y-4">
            <SectionHeader
              title="Spending trend"
              description={
                primaryTotal
                  ? `Monthly ${primaryTotal.currency} spend over time.`
                  : "Monthly spend over time."
              }
            />
            {data.monthlyTrend.length > 0 ? (
              <Card>
                <CardContent className="space-y-4">
                  {data.monthlyTrend.map((m) => (
                    <BarRow
                      key={m.month}
                      label={formatMonth(m.month)}
                      caption={`${formatMoney(m.total, m.currency)} · ${m.count}`}
                      value={m.total}
                      max={maxMonth}
                    />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="No trend data"
                description="No invoices in the primary currency for this range."
              />
            )}
          </section>
        </div>
      ) : null}
    </PageWrapper>
  );
}
