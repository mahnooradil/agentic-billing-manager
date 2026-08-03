"use client";

import * as React from "react";
import { Lightbulb, Check, X, RotateCcw, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SectionHeader } from "@/components/common/section-header";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
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

const SEVERITY_LABELS: Record<RecommendationSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_STYLES: Record<RecommendationSeverity, { pill: string; dot: string }> = {
  high: { pill: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  medium: {
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  low: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

const STATUS_LABELS: Record<RecommendationStatus, string> = {
  active: "Generated",
  completed: "Completed",
  dismissed: "Dismissed",
};

const CATEGORY_LABELS: Record<string, string> = {
  collections: "Collections",
  "cash-flow": "Cash flow",
  cost: "Cost",
  general: "General",
};

/**
 * Autonomous AI Recommendations panel — embedded as a section on the Overview
 * page. Recommendations are generated and kept up to date on the backend
 * (via the Billing Advisor Agent) after business-data changes — there is no
 * manual "Generate" action. The panel simply reflects the stored state and
 * polls for updates, and lets the user manage each recommendation's lifecycle.
 */
export function AiRecommendations() {
  const { general } = usePreferences();
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
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Recommendations"
        description="Your Billing Agent reviews your invoices and flags what needs attention — overdue payments, cash-flow risk, and where your spend is concentrated."
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
            Last updated {formatDateTime(lastUpdatedAt, general)}
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
              ? "Recommendations appear here automatically as your billing data changes."
              : "Nothing here yet."
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Recommendation</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Suggested action</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((rec) => {
                const severity = SEVERITY_STYLES[rec.severity];
                const isResolved = rec.status !== "active";
                return (
                  <TableRow key={rec.id}>
                    <TableCell className="max-w-sm align-top">
                      <p className="font-medium text-foreground">{rec.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{rec.detail}</p>
                      <span className="mt-1.5 inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {CATEGORY_LABELS[rec.category] ?? rec.category}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          severity.pill
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", severity.dot)} />
                        {SEVERITY_LABELS[rec.severity]}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs align-top text-muted-foreground">
                      {rec.suggestedAction || "—"}
                    </TableCell>
                    <TableCell className="align-top whitespace-nowrap">
                      <p className="text-xs text-muted-foreground">
                        Generated{" "}
                        <span className="text-foreground">
                          {formatRelativeTime(rec.generatedAt, general)}
                        </span>
                      </p>
                      {isResolved ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {STATUS_LABELS[rec.status]}{" "}
                          <span className="text-foreground">
                            {formatRelativeTime(rec.updatedAt, general)}
                          </span>
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex justify-end gap-1">
                        {rec.status === "active" ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Mark as done"
                              title="Mark as done"
                              onClick={() => changeStatus(rec.id, "completed")}
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Dismiss"
                              title="Dismiss"
                              className="text-destructive hover:text-destructive"
                              onClick={() => changeStatus(rec.id, "dismissed")}
                            >
                              <X className="size-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Reactivate"
                            title="Reactivate"
                            onClick={() => changeStatus(rec.id, "active")}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
