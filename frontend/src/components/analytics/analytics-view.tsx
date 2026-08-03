"use client";

import * as React from "react";
import {
  BarChart3,
  Layers,
  Receipt,
  TrendingUp,
  Wallet,
  CircleCheck,
  CircleAlert,
  TriangleAlert,
  Info,
  Sparkles,
  Copy,
  Ban,
  Flame,
  PiggyBank,
  Repeat,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FlatStatCard } from "@/components/common/flat-stat-card";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  formatMoney as fmtMoney,
  formatMonth as fmtMonth,
} from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import { ApiError } from "@/services/api/client";
import {
  getAnalyticsOverview,
  getAdvancedAnalytics,
} from "@/services/analytics/analytics.service";
import type {
  AdvancedAnalytics,
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

const INSIGHT_STYLES: Record<
  AnalyticsInsight["severity"],
  { icon: LucideIcon; className: string }
> = {
  warning: { icon: TriangleAlert, className: "text-destructive" },
  success: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  info: { icon: Info, className: "text-muted-foreground" },
};

/** A slim inline bar (used inside a table cell) showing value relative to max. */
function ShareBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:w-24">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Analytics screen: fetches the composite analytics overview and renders KPIs,
 * per-currency totals, spend-by-platform and monthly-trend tables, a status
 * breakdown, and rule-based insights. Data-dense sections are plain tables —
 * the professional, scannable presentation for tabular financial figures —
 * rather than card grids. Handles loading, error and empty (no billing data)
 * states.
 */
export function AnalyticsView() {
  // Money + month labels honor the user's General preferences (shared layer).
  const { general } = usePreferences();
  const formatMoney = (amount: number, currency: string) =>
    fmtMoney(amount, currency, general);
  const formatMonth = (month: string) => fmtMonth(month);

  const [range, setRange] = React.useState<AnalyticsRange>("all");
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [data, setData] = React.useState<AnalyticsOverview | null>(null);
  const [advanced, setAdvanced] = React.useState<AdvancedAnalytics | null>(null);
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

  // Advanced billing intelligence (F6) — loads independently; if it fails the
  // core analytics above still render (its sections just don't appear).
  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getAdvancedAnalytics(range);
        if (!ignore) setAdvanced(response.data.analytics);
      } catch {
        if (!ignore) setAdvanced(null);
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
            <FlatStatCard
              label="Total Invoices"
              value={String(data.invoiceCount)}
              icon={Receipt}
              tone="neutral"
              hint="All statuses, selected range"
            />
            <FlatStatCard
              label={`Total Spend${primaryTotal ? ` (${primaryTotal.currency})` : ""}`}
              value={primaryTotal ? formatMoney(primaryTotal.total, primaryTotal.currency) : "—"}
              icon={Wallet}
              tone="primary"
              hint="Paid + Pending + Overdue"
            />
            <FlatStatCard
              label="Paid"
              value={primaryTotal ? formatMoney(primaryTotal.paid, primaryTotal.currency) : "—"}
              icon={CircleCheck}
              tone="success"
              hint="Invoices already settled"
            />
            <FlatStatCard
              label="Outstanding"
              value={
                primaryTotal ? formatMoney(primaryTotal.outstanding, primaryTotal.currency) : "—"
              }
              icon={CircleAlert}
              tone="warning"
              hint="Not yet paid: Pending + Overdue"
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
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.totalsByCurrency.map((c) => (
                    <TableRow key={c.currency}>
                      <TableCell className="font-medium">{c.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(c.total, c.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatMoney(c.paid, c.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                        {formatMoney(c.outstanding, c.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {c.count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* Status breakdown (counts, currency-agnostic). */}
          <section className="space-y-4">
            <SectionHeader title="Invoice status" description="Count of invoices by status." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {data.byStatus.map((s) => (
                <FlatStatCard
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
                  tone={
                    s.status === "Paid" ? "success" : s.status === "Overdue" ? "danger" : "warning"
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
              <Card className="overflow-hidden p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Platform</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead>Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byPlatform.map((p) => (
                      <TableRow key={p.platformId || p.slug || p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(p.total, p.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {p.count}
                        </TableCell>
                        <TableCell>
                          <ShareBar value={p.total} max={maxPlatform} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
              <Card className="overflow-hidden p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead>Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.monthlyTrend.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium">{formatMonth(m.month)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(m.total, m.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {m.count}
                        </TableCell>
                        <TableCell>
                          <ShareBar value={m.total} max={maxMonth} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="No trend data"
                description="No invoices in the primary currency for this range."
              />
            )}
          </section>

          {/* ── Advanced billing intelligence (F6) ── */}
          {advanced && advanced.invoiceCount > 0 ? (
            <AdvancedSections advanced={advanced} />
          ) : null}
        </div>
      ) : null}
    </PageWrapper>
  );
}

/**
 * Advanced billing-intelligence sections (F6, polished in F6.1). Every section
 * always renders — with an informative empty state when it has no data — so the
 * layout is stable and reads like a professional SaaS dashboard. Tabular data
 * (expenses, duplicates, high-cost/underused platforms) renders as tables;
 * narrative insight lists stay as cards. Presentation only.
 */
function AdvancedSections({ advanced }: { advanced: AdvancedAnalytics }) {
  const { general } = usePreferences();
  const formatMoney = (amount: number, currency: string) =>
    fmtMoney(amount, currency, general);
  const formatMonth = (month: string) => fmtMonth(month);
  const {
    insights,
    growth,
    largestExpenses,
    duplicateSubscriptions,
    highCostPlatforms,
    underusedSubscriptions,
  } = advanced;
  const maxExpense = Math.max(0, ...largestExpenses.map((e) => e.amount));
  const maxHighCost = Math.max(0, ...highCostPlatforms.map((p) => p.total));

  return (
    <>
      {/* AI Insights — summary + three insight cards. */}
      <section className="space-y-4">
        <SectionHeader
          title="AI Insights"
          description="Automated intelligence from your billing data — no external AI calls."
        />
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <p className="text-sm leading-relaxed">{advanced.summary}</p>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InsightCard
            icon={Flame}
            tone="warning"
            title="Top Spending"
            items={insights.topSpending}
            emptyText="Nothing notable yet."
          />
          <InsightCard
            icon={PiggyBank}
            tone="success"
            title="Cost Saving"
            items={insights.costSaving}
            emptyText="No savings opportunities found."
          />
          <InsightCard
            icon={TriangleAlert}
            tone="danger"
            title="Risks"
            items={insights.risks}
            emptyText="No risks detected."
          />
        </div>
      </section>

      {/* Spending Growth — stat cards or empty state. */}
      <section className="space-y-4">
        <SectionHeader
          title="Spending Growth"
          description="How this month compares to the previous month."
        />
        {growth && growth.changePercent !== null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <GrowthCard growth={growth} />
            <FlatStatCard
              label={`This month · ${formatMonth(growth.currentMonth)}`}
              value={formatMoney(growth.currentTotal, growth.currency)}
              icon={Wallet}
              tone="primary"
            />
            <FlatStatCard
              label={`Previous month · ${formatMonth(growth.previousMonth)}`}
              value={formatMoney(growth.previousTotal, growth.currency)}
              icon={Sparkles}
              tone="neutral"
            />
          </div>
        ) : (
          <SectionEmpty
            icon={TrendingUp}
            message="No historical data yet. Add billing records from multiple months to unlock this insight."
          />
        )}
      </section>

      {/* Largest Recurring Expenses — table or empty state. */}
      <section className="space-y-4">
        <SectionHeader
          title="Largest Recurring Expenses"
          description="Charges that repeat across multiple months."
        />
        {largestExpenses.length > 0 ? (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Months</TableHead>
                  <TableHead className="text-right">Occurrences</TableHead>
                  <TableHead>Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {largestExpenses.map((e, index) => (
                  <TableRow key={`${e.platform}-${e.amount}-${index}`}>
                    <TableCell className="font-medium">{e.platform}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(e.amount, e.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {e.months}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {e.occurrences}×
                    </TableCell>
                    <TableCell>
                      <ShareBar value={e.amount} max={maxExpense} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <SectionEmpty icon={Repeat} message="No recurring expenses detected." />
        )}
      </section>

      {/* Duplicate Charges — table or empty state. */}
      <section className="space-y-4">
        <SectionHeader
          title="Duplicate Charges"
          description="The same platform billed the same amount more than once in a month."
        />
        {duplicateSubscriptions.length > 0 ? (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duplicateSubscriptions.map((d, index) => (
                  <TableRow key={`${d.platform}-${d.month}-${index}`}>
                    <TableCell className="flex items-center gap-2 font-medium">
                      <Copy className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      {d.platform}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(d.amount, d.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {d.count}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatMonth(d.month)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <SectionEmpty icon={Copy} message="No duplicate charges detected." />
        )}
      </section>

      {/* High-cost Platforms — table or empty state. */}
      <section className="space-y-4">
        <SectionHeader
          title="High-cost Platforms"
          description="Where your spend concentrates most."
        />
        {highCostPlatforms.length > 0 ? (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead>Of total spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {highCostPlatforms.map((p, index) => (
                  <TableRow key={`${p.platform}-${index}`}>
                    <TableCell className="font-medium">{p.platform}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(p.total, p.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p.sharePercent}%
                    </TableCell>
                    <TableCell>
                      <ShareBar value={p.total} max={maxHighCost} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <SectionEmpty icon={Layers} message="No high-cost platforms detected." />
        )}
      </section>

      {/* Underused Subscriptions — table or empty state. */}
      <section className="space-y-4">
        <SectionHeader
          title="Underused Subscriptions"
          description="Inactive platforms that are still being billed."
        />
        {underusedSubscriptions.length > 0 ? (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {underusedSubscriptions.map((u, index) => (
                  <TableRow key={`${u.platform}-${index}`}>
                    <TableCell className="flex items-center gap-2 font-medium">
                      <Ban className="size-3.5 shrink-0 text-muted-foreground" />
                      {u.platform}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(u.total, u.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <SectionEmpty icon={Ban} message="No underused subscriptions found." />
        )}
      </section>
    </>
  );
}

type InsightTone = "warning" | "success" | "danger";

const INSIGHT_TONES: Record<InsightTone, string> = {
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  danger: "bg-destructive/10 text-destructive",
};

/** A titled insight card with an icon badge and a list (or empty text). */
function InsightCard({
  icon: Icon,
  tone,
  title,
  items,
  emptyText,
}: {
  icon: LucideIcon;
  tone: InsightTone;
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              INSIGHT_TONES[tone]
            )}
          >
            <Icon className="size-4" />
          </span>
          <h3 className="font-heading text-sm font-medium">{title}</h3>
        </div>
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={index} className="text-sm leading-relaxed text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Month-over-month growth stat card with a green (▲) / red (▼) indicator. */
function GrowthCard({
  growth,
}: {
  growth: NonNullable<AdvancedAnalytics["growth"]>;
}) {
  const { general } = usePreferences();
  const formatMoney = (amount: number, currency: string) =>
    fmtMoney(amount, currency, general);
  const up = (growth.changePercent ?? 0) >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const tone = up ? "success" : "danger";
  const color = up
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-destructive";
  return (
    <Card>
      <div className="flex items-center gap-3.5 p-5">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            INSIGHT_TONES[tone]
          )}
        >
          <Icon className="size-5.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">
            Month-over-month
          </p>
          <p className={cn("font-heading text-2xl font-semibold tracking-tight", color)}>
            {up ? "+" : ""}
            {growth.changePercent}%
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {up ? "Increased" : "Decreased"} by{" "}
            {formatMoney(Math.abs(growth.changeAmount), growth.currency)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Compact per-section empty state (reuses the Card system). */
function SectionEmpty({
  icon: Icon,
  message,
}: {
  icon: LucideIcon;
  message: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
