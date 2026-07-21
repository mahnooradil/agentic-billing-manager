"use client";

import * as React from "react";
import {
  Lightbulb,
  Check,
  X,
  RotateCcw,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api/client";
import {
  getRecommendations,
  updateRecommendationStatus,
} from "@/services/recommendations/recommendation.service";
import type {
  Recommendation,
  RecommendationSeverity,
  RecommendationStatus,
  RecommendationStatusFilter,
} from "@/services/types/recommendations";

type ViewStatus = "loading" | "error" | "ready";

/** How often the panel polls for autonomously-updated recommendations. */
const POLL_INTERVAL_MS = 20_000;

const FILTER_OPTIONS: { value: RecommendationStatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "dismissed", label: "Dismissed" },
];

const SEVERITY_STYLES: Record<RecommendationSeverity, string> = {
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "border-border bg-muted text-muted-foreground",
};

/**
 * Autonomous AI Recommendations panel. Recommendations are generated and kept
 * up to date on the backend after business-data changes — there is no manual
 * "Generate" action. The panel simply reflects the stored state and polls for
 * updates, and lets the user manage each recommendation's lifecycle.
 */
export function AiRecommendations() {
  const [filter, setFilter] = React.useState<RecommendationStatusFilter>("active");
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [items, setItems] = React.useState<Recommendation[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  // Fetch on filter change, on manual reload, and on each poll tick.
  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getRecommendations(filter);
        if (ignore) return;
        setItems(response.data.recommendations);
        setLastUpdatedAt(response.data.meta.lastUpdatedAt);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Failed to load recommendations."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [filter, reloadKey]);

  // Lightweight polling — bumping reloadKey re-runs the fetch effect.
  React.useEffect(() => {
    const id = setInterval(() => setReloadKey((key) => key + 1), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const changeStatus = async (id: string, next: RecommendationStatus) => {
    try {
      await updateRecommendationStatus(id, next);
    } catch {
      // Ignore — the next poll/reload reconciles the view.
    } finally {
      setReloadKey((key) => key + 1);
    }
  };

  const retry = () => {
    setStatus("loading");
    setReloadKey((key) => key + 1);
  };

  const autoRefreshIndicator = (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <RefreshCw className="size-3.5" />
      Auto-updating
    </span>
  );

  return (
    <PageWrapper className="pt-0">
      <SectionHeader
        title="AI Recommendations"
        description="Automatically generated from your billing data and kept up to date."
        actions={autoRefreshIndicator}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={filter === option.value ? "default" : "ghost"}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {lastUpdatedAt ? (
          <span className="text-xs text-muted-foreground">
            Last updated {new Date(lastUpdatedAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      {status === "loading" ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner label="Loading recommendations…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={
            filter === "active"
              ? "No active recommendations"
              : `No ${filter} recommendations`
          }
          description={
            filter === "active"
              ? "Recommendations appear here automatically as your billing data changes. Make sure an AI provider is configured in Settings."
              : "Nothing here yet."
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} onChangeStatus={changeStatus} />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}

function RecommendationCard({
  rec,
  onChangeStatus,
}: {
  rec: Recommendation;
  onChangeStatus: (id: string, next: RecommendationStatus) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-base font-medium">{rec.title}</h3>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
              SEVERITY_STYLES[rec.severity]
            )}
          >
            {rec.severity}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">{rec.detail}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground capitalize">
            {rec.category}
          </span>
          {rec.suggestedAction ? (
            <span className="inline-flex items-center gap-1 text-foreground">
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              {rec.suggestedAction}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {rec.status === "active" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onChangeStatus(rec.id, "completed")}>
                <Check /> Complete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChangeStatus(rec.id, "dismissed")}>
                <X /> Dismiss
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onChangeStatus(rec.id, "active")}>
              <RotateCcw /> Reactivate
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
