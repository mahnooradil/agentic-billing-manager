"use client";

import * as React from "react";
import { Boxes, CircleCheck, CircleX, Inbox, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { StatCard } from "@/components/common/stat-card";
import { ApiError } from "@/services/api/client";
import { getDashboardStats } from "@/services/dashboard/dashboard.service";
import type { DashboardStats } from "@/services/types/dashboard";

type ViewStatus = "loading" | "error" | "ready";

/**
 * Overview screen: fetches live platform statistics from the backend and renders
 * them in the existing StatCard grid. Keeps the original design — only the
 * placeholder values are replaced with live data. Handles loading, error and
 * empty (no platforms) states.
 */
export function OverviewView() {
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [loadError, setLoadError] = React.useState("");

  // Bumping reloadKey re-runs the fetch effect — the single source of loading.
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getDashboardStats();
        if (ignore) return;
        setStats(response.data.stats);
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

  return (
    <PageWrapper>
      <PageHeader
        title="Overview"
        description="A snapshot of your billing workspace."
      />

      {status === "loading" ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner label="Loading statistics…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : stats && stats.totalPlatforms === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No platforms yet"
          description="Create your first platform to see live statistics here."
        />
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Platforms"
            value={String(stats.totalPlatforms)}
            hint="All platforms"
            icon={Boxes}
          />
          <StatCard
            label="Active Platforms"
            value={String(stats.activePlatforms)}
            hint="Currently active"
            icon={CircleCheck}
          />
          <StatCard
            label="Inactive Platforms"
            value={String(stats.inactivePlatforms)}
            hint="Currently inactive"
            icon={CircleX}
          />
          <StatCard
            label="AI Insights"
            value="—"
            hint="Coming soon"
            icon={Sparkles}
          />
        </div>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          title="Recent activity"
          description="Your latest billing and usage events will appear here."
        />
        <EmptyState
          icon={Inbox}
          title="No activity yet"
          description="Once platforms are connected, recent events will show up in this space."
        />
      </section>
    </PageWrapper>
  );
}
