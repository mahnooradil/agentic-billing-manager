"use client";

import * as React from "react";
import { Wallet, CheckCircle2, Clock3 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SpendTrendChart } from "@/components/dashboard/spend-trend-chart";
import { PlatformSpendChart } from "@/components/dashboard/platform-spend-chart";
import { InvoiceStatusRow } from "@/components/dashboard/invoice-status-row";
import { ApiError } from "@/services/api/client";
import { formatNumber } from "@/lib/format";
import { getAnalyticsOverview } from "@/services/analytics/analytics.service";
import { useAuth } from "@/hooks/use-auth";
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import type { AnalyticsOverview } from "@/services/types/analytics";

type ViewStatus = "loading" | "error" | "ready";

const CACHE_KEY = "overview:6m";

/** Time-of-day greeting — computed at render time, no state/effect needed. */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Overview screen: a calm, chart-first snapshot of the workspace. The chart
 * cards are always shown — each one falls back to its own "No history yet"
 * message when there's nothing to plot, instead of swapping the whole page
 * out for a generic empty state.
 */
export function OverviewView() {
  const { user } = useAuth();
  const firstName = user?.fullName?.trim().split(/\s+/)[0];

  const cached = readPageCache<AnalyticsOverview>(CACHE_KEY);
  const [status, setStatus] = React.useState<ViewStatus>(cached ? "ready" : "loading");
  const [analytics, setAnalytics] = React.useState<AnalyticsOverview | null>(
    cached
  );
  const [loadError, setLoadError] = React.useState("");

  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const overview = await getAnalyticsOverview("6m");
        if (ignore) return;
        writePageCache(CACHE_KEY, overview.data.analytics);
        setAnalytics(overview.data.analytics);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Failed to load dashboard statistics."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setStatus("loading");
    reload();
  };

  const primaryTotals = analytics?.totalsByCurrency[0] ?? null;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <PageWrapper>
      {/* Calm welcome header — no animated blob, just a clean panel. */}
      <div className="rounded-2xl bg-brand-gradient p-6 text-primary-foreground sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.18em] text-white/70 uppercase">
            {today}
          </p>
          <h1 className="font-heading text-2xl font-semibold text-balance sm:text-3xl">
            {firstName ? `${getGreeting()}, ${firstName}` : "Your billing workspace"}
          </h1>
          <p className="max-w-lg text-sm text-white/80">
            Every subscription, every invoice — one clear view, always
            current.
          </p>
        </div>
      </div>

      {status === "loading" ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner label="Loading statistics…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : (
        <>
          {primaryTotals ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label={`Total spend (${primaryTotals.currency})`}
                value={formatNumber(primaryTotals.total)}
                hint="Last 6 months"
                icon={Wallet}
              />
              <StatCard
                label="Paid"
                value={formatNumber(primaryTotals.paid)}
                hint="Settled invoices"
                icon={CheckCircle2}
              />
              <StatCard
                label="Outstanding"
                value={formatNumber(primaryTotals.outstanding)}
                hint="Pending + overdue"
                icon={Clock3}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Monthly spend
                  {analytics?.primaryCurrency ? ` (${analytics.primaryCurrency})` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics && analytics.monthlyTrend.length > 0 ? (
                  <SpendTrendChart
                    data={analytics.monthlyTrend}
                    currency={analytics.primaryCurrency ?? ""}
                  />
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    No history yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Invoice status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InvoiceStatusRow data={analytics?.byStatus ?? []} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Spend by platform
                  {analytics?.primaryCurrency ? ` (${analytics.primaryCurrency})` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics && analytics.byPlatform.length > 0 ? (
                  <PlatformSpendChart
                    data={analytics.byPlatform}
                    currency={analytics.primaryCurrency ?? ""}
                  />
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    No history yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PageWrapper>
  );
}
