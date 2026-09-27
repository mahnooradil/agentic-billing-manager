"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  CheckCircle2,
  Clock3,
  Boxes,
  Workflow,
  Layers,
  Bell,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlatStatCard } from "@/components/common/flat-stat-card";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SpendTrendChart } from "@/components/dashboard/spend-trend-chart";
import { PlatformSpendChart } from "@/components/dashboard/platform-spend-chart";
import { InvoiceStatusRow } from "@/components/dashboard/invoice-status-row";
import { ApiError } from "@/services/api/client";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { getAnalyticsOverview } from "@/services/analytics/analytics.service";
import { getMyPlan } from "@/services/plan/plan.service";
import { getMyCredits } from "@/services/credits/credits.service";
import { listPlatformConnections } from "@/services/connections/platform-connections.service";
import { notificationStore } from "@/services/notifications/notification-store";
import { emitClientEvent } from "@/services/events/client-events";
import { useAuth } from "@/hooks/use-auth";
import { usePreferences } from "@/services/preferences/preferences-store";
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import type { AnalyticsOverview } from "@/services/types/analytics";

type ViewStatus = "loading" | "error" | "ready";

const CACHE_KEY = "overview:6m";

interface WorkspaceGlance {
  planName: string;
  creditsBalance: number;
  activePlatforms: number;
  activeAutomations: number;
}
const GLANCE_CACHE_KEY = "overview:glance";

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
  const { general } = usePreferences();
  const router = useRouter();
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

  // "Workspace at a glance" — plan, credits, active platforms/automations.
  // A separate fetch/cache lifecycle from the analytics above (genuinely
  // different endpoints); its own failure never blocks the charts.
  const cachedGlance = readPageCache<WorkspaceGlance>(GLANCE_CACHE_KEY);
  const [glance, setGlance] = React.useState<WorkspaceGlance | null>(cachedGlance);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [planRes, creditsRes, connectionsRes] = await Promise.all([
          getMyPlan(),
          getMyCredits(),
          listPlatformConnections(),
        ]);
        if (ignore) return;
        const connections = connectionsRes.data.connections;
        const next: WorkspaceGlance = {
          planName: planRes.data.plan.displayName,
          creditsBalance: Math.max(0, creditsRes.data.balance),
          activePlatforms: connections.filter((c) => c.status === "connected").length,
          activeAutomations: connections.filter(
            (c) => c.status === "connected" && c.connectionType === "oauth"
          ).length,
        };
        writePageCache(GLANCE_CACHE_KEY, next);
        setGlance(next);
      } catch {
        // Non-critical strip — leave whatever (possibly cached) value is
        // already showing rather than surfacing a second error state.
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  // "Recent activity" — the shared Notification Store (same data as the
  // bell), so no extra endpoint or polling loop is introduced here.
  const { notifications: recentActivity } = React.useSyncExternalStore(
    notificationStore.subscribe,
    notificationStore.getSnapshot,
    notificationStore.getServerSnapshot
  );
  const recentItems = [...recentActivity]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const retry = () => {
    setStatus("loading");
    reload();
  };

  const primaryTotals = analytics?.totalsByCurrency[0] ?? null;

  return (
    <PageWrapper>
      {/* Plain greeting — no container, no card, no background color. Just
          the text directly on the page's own white/neutral background. */}
      <h1 className="font-heading text-2xl font-semibold text-balance text-foreground sm:text-3xl">
        {firstName ? `${getGreeting()}, ${firstName}` : "Your billing workspace"}
      </h1>

      {glance ? (
        <Card>
          <CardContent className="flex flex-col gap-6 divide-y sm:flex-row sm:divide-x sm:divide-y-0">
            <GlanceStat
              icon={Layers}
              label="Plan"
              value={glance.planName}
              action={{ label: "Manage", onClick: () => router.push("/dashboard/plan") }}
            />
            <GlanceStat
              icon={Wallet}
              label="AI credits"
              value={glance.creditsBalance.toLocaleString()}
              action={{ label: "Manage", onClick: () => router.push("/dashboard/plan") }}
            />
            <GlanceStat
              icon={Boxes}
              label="Active platforms"
              value={String(glance.activePlatforms)}
              action={{ label: "View", onClick: () => router.push("/dashboard/platforms") }}
            />
            <GlanceStat
              icon={Workflow}
              label="Active automations"
              value={String(glance.activeAutomations)}
              action={{ label: "View", onClick: () => router.push("/dashboard/automation") }}
            />
          </CardContent>
        </Card>
      ) : null}

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
              <FlatStatCard
                label={`Total spend (${primaryTotals.currency})`}
                value={formatNumber(primaryTotals.total)}
                hint="Last 6 months"
                icon={Wallet}
                tone="primary"
              />
              <FlatStatCard
                label="Paid"
                value={formatNumber(primaryTotals.paid)}
                hint="Settled invoices"
                icon={CheckCircle2}
                tone="success"
              />
              <FlatStatCard
                label="Outstanding"
                value={formatNumber(primaryTotals.outstanding)}
                hint="Pending + overdue"
                icon={Clock3}
                tone="warning"
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

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recent activity
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => emitClientEvent("notification:open")}
              >
                View all
                <ArrowRight />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {recentItems.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  Nothing yet — activity shows up here as your billing data changes.
                </p>
              ) : (
                <ul className="divide-y">
                  {recentItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 px-6 py-3.5 text-sm"
                    >
                      <Bell className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(item.createdAt, general)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageWrapper>
  );
}

function GlanceStat({
  icon: Icon,
  label,
  value,
  action,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  action: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-1 items-center justify-between gap-4 py-4 first:pt-0 last:pb-0 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-medium text-foreground">{value}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={action.onClick}
        className="shrink-0 text-xs font-medium text-foreground underline underline-offset-2"
      >
        {action.label}
      </button>
    </div>
  );
}
