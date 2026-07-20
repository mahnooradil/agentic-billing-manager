"use client";

import * as React from "react";
import {
  Sparkles,
  Loader2,
  Lightbulb,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { FormAlert } from "@/components/common/form-alert";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api/client";
import { generateRecommendations } from "@/services/ai/ai-recommendations.service";
import type { AnalyticsRange } from "@/services/types/analytics";
import type {
  AiRecommendationsResult,
  RecommendationFocus,
  RecommendationSeverity,
} from "@/services/types/ai-recommendations";

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "3m", label: "3 mo" },
  { value: "6m", label: "6 mo" },
  { value: "12m", label: "12 mo" },
];

const FOCUS_OPTIONS: { value: RecommendationFocus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "spend", label: "Spend" },
];

const SEVERITY_STYLES: Record<RecommendationSeverity, string> = {
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  medium:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "border-border bg-muted text-muted-foreground",
};

/** A compact segmented button group (no extra state, lint-safe). */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          onClick={() => onChange(option.value)}
          disabled={disabled}
          aria-pressed={value === option.value}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * AI Recommendations panel. On an explicit "Generate" click it asks the backend
 * to turn the billing analytics snapshot into AI recommendations. Results are
 * ephemeral (no persistence). Requires a configured AI provider (Settings).
 */
export function AiRecommendations() {
  const [range, setRange] = React.useState<AnalyticsRange>("all");
  const [focus, setFocus] = React.useState<RecommendationFocus>("all");
  const [generating, setGenerating] = React.useState(false);
  const [result, setResult] = React.useState<AiRecommendationsResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await generateRecommendations({ range, focus });
      setResult(response.data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to generate recommendations. Please try again."
      );
    } finally {
      setGenerating(false);
    }
  };

  const generateButton = (
    <Button onClick={handleGenerate} disabled={generating}>
      {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {result ? "Regenerate" : "Generate"}
    </Button>
  );

  return (
    <PageWrapper className="pt-0">
      <SectionHeader
        title="AI Recommendations"
        description="AI-generated, actionable recommendations from your billing analytics."
        actions={generateButton}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Range</span>
          <Segmented
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
            disabled={generating}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Focus</span>
          <Segmented
            options={FOCUS_OPTIONS}
            value={focus}
            onChange={setFocus}
            disabled={generating}
          />
        </div>
      </div>

      {error ? <FormAlert variant="error" message={error} /> : null}

      {generating ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Analyzing your billing data…
        </div>
      ) : !result ? (
        <EmptyState
          icon={Lightbulb}
          title="No recommendations yet"
          description="Click Generate to get AI recommendations based on your billing analytics."
        />
      ) : !result.dataAvailable ? (
        <EmptyState
          icon={Lightbulb}
          title="No billing data to analyze"
          description="Add billing records first, then generate recommendations."
        />
      ) : result.recommendations.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No recommendations returned"
          description="The assistant did not return any recommendations. Try a different focus or range."
        />
      ) : (
        <div className="space-y-3">
          {result.recommendations.map((rec, index) => (
            <RecommendationCard key={`${index}-${rec.title}`} rec={rec} />
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            Generated by {result.provider} · {result.model} ·{" "}
            {new Date(result.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </PageWrapper>
  );
}

function RecommendationCard({
  rec,
}: {
  rec: AiRecommendationsResult["recommendations"][number];
}) {
  const Icon: LucideIcon = Lightbulb;
  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
      </CardContent>
    </Card>
  );
}
