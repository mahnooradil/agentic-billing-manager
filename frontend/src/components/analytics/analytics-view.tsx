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
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { StatCard } from "@/components/common/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
          <div className="reveal-group grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
 * layout is stable and reads like a professional SaaS dashboard. Presentation
 * only: no analytics logic, no data shaping.
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
            <StatCard
              label="This month"
              value={formatMoney(growth.currentTotal, growth.currency)}
              hint={formatMonth(growth.currentMonth)}
              icon={Wallet}
            />
            <StatCard
              label="Previous month"
              value={formatMoney(growth.previousTotal, growth.currency)}
              hint={formatMonth(growth.previousMonth)}
              icon={Coins}
            />
          </div>
        ) : (
          <SectionEmpty
            icon={TrendingUp}
            message="No historical data yet. Add billing records from multiple months to unlock this insight."
          />
        )}
      </section>

      {/* Largest Recurring Expenses — bars or empty state. */}
      <section className="space-y-4">
        <SectionHeader
          title="Largest Recurring Expenses"
          description="Charges that repeat across multiple months."
        />
        {largestExpenses.length > 0 ? (
          <Card>
            <CardContent className="space-y-4">
              {largestExpenses.map((e, index) => (
                <BarRow
                  key={`${e.platform}-${e.amount}-${index}`}
                  label={e.platform}
                  caption={`${formatMoney(e.amount, e.currency)} · ${e.months} mo · ${e.occurrences}×`}
                  value={e.amount}
                  max={maxExpense}
                />
              ))}
            </CardContent>
          </Card>
        ) : (
          <SectionEmpty icon={Repeat} message="No recurring expenses detected." />
        )}
      </section>

      {/* Duplicate Charges — cards or empty state. */}
      <section className="space-y-4">
        <SectionHeader
          title="Duplicate Charges"
          description="The same platform billed the same amount more than once in a month."
        />
        {duplicateSubscriptions.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {duplicateSubscriptions.map((d, index) => (
              <Card key={`${d.platform}-${d.month}-${index}`}>
                <CardContent className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Copy className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.platform}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(d.amount, d.currency)} × {d.count} in{" "}
                      {formatMonth(d.month)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <SectionEmpty icon={Copy} message="No duplicate charges detected." />
        )}
      </section>

      {/* High-cost Platforms — platform cards or empty state. */}
      <section className="space-y-4">
        <SectionHeader
          title="High-cost Platforms"
          description="Where your spend concentrates most."
        />
        {highCostPlatforms.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {highCostPlatforms.map((p, index) => (
              <Card key={`${p.platform}-${index}`}>
                <CardContent className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{p.platform}</span>
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold">
                      {p.sharePercent}%
                    </span>
                  </div>
                  <p className="font-heading text-lg font-semibold tracking-tight">
                    {formatMoney(p.total, p.currency)}
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(p.sharePercent, 100)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <SectionEmpty icon={Layers} message="No high-cost platforms detected." />
        )}
      </section>

      {/* Underused Subscriptions — cards or empty state. */}
      <section className="space-y-4">
        <SectionHeader
          title="Underused Subscriptions"
          description="Inactive platforms that are still being billed."
        />
        {underusedSubscriptions.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {underusedSubscriptions.map((u, index) => (
              <Card key={`${u.platform}-${index}`}>
                <CardContent className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{u.platform}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {formatMoney(u.total, u.currency)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{u.reason}</p>
                </CardContent>
              </Card>
            ))}
          </div>
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
  const color = up
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-destructive";
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-sm text-muted-foreground">Month-over-month</p>
        <p
          className={cn(
            "flex items-center gap-1 font-heading text-2xl font-semibold tracking-tight",
            color
          )}
        >
          <Icon className="size-5" />
          {up ? "+" : ""}
          {growth.changePercent}%
        </p>
        <p className="text-xs text-muted-foreground">
          {up ? "Increased" : "Decreased"} by{" "}
          {formatMoney(Math.abs(growth.changeAmount), growth.currency)}
        </p>
      </CardContent>
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
