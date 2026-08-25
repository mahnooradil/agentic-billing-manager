"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { cn } from "@/lib/utils";
import { useAlertState } from "@/hooks/use-alert-state";
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import { ApiError } from "@/services/api/client";
import { getMyPlan, updateMyPlan } from "@/services/plan/plan.service";
import type { PlanData, PlanDefinition } from "@/services/types/plan";

type ViewStatus = "loading" | "error" | "ready";

const CACHE_KEY = "plan";

function usageLabel(used: number, max: number | null): string {
  return max === null ? `${used} used — unlimited` : `${used} of ${max} used`;
}

function usagePercent(used: number, max: number | null): number {
  if (max === null || max === 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

/** Readable label for a plan's credit cycle length — 30/365 are the only
 *  values the backend currently issues, but any other day count still
 *  degrades gracefully instead of showing a mismatched unit. */
function creditsCycleLabel(cycleDays: number): string {
  return cycleDays === 30 ? "month" : cycleDays === 365 ? "year" : `${cycleDays} days`;
}

/** The user's OWN plan for using this app — current tier, real usage against
 *  its limits, and every tier available to switch to. No payment processor is
 *  wired up yet, so switching tiers here is free and immediate. */
export function BillingPlanTab() {
  const cached = readPageCache<PlanData>(CACHE_KEY);
  const [status, setStatus] = React.useState<ViewStatus>(cached ? "ready" : "loading");
  const [data, setData] = React.useState<PlanData | null>(cached);
  const [loadError, setLoadError] = React.useState("");
  const [switchingTo, setSwitchingTo] = React.useState<string | null>(null);
  const [alert, setAlert] = useAlertState();
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getMyPlan();
        if (ignore) return;
        writePageCache(CACHE_KEY, response.data);
        setData(response.data);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(error instanceof ApiError ? error.message : "Failed to load your plan.");
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const handleSwitch = async (plan: PlanDefinition) => {
    setAlert(null);
    setSwitchingTo(plan.tier);
    try {
      await updateMyPlan({ tier: plan.tier });
      setAlert({ type: "success", message: `Switched to the ${plan.displayName} plan.` });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Could not switch plans.",
      });
    } finally {
      setSwitchingTo(null);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner label="Loading your plan…" />
      </div>
    );
  }
  if (status === "error" || !data) {
    return (
      <ErrorState
        description={loadError}
        onRetry={() => {
          setStatus("loading");
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}

      {/* Current plan + usage. */}
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="font-heading text-xl font-semibold">
                {data.plan.displayName}
                {data.plan.priceMonthly > 0 ? (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    ${data.plan.priceMonthly}/mo
                  </span>
                ) : (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">Free</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">AI credits</p>
              <p className="tabular-nums font-medium text-foreground">
                {data.plan.credits.allowance.toLocaleString()}/
                {creditsCycleLabel(data.plan.credits.cycleDays)}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Connected platforms</span>
                <span className="tabular-nums text-foreground">
                  {usageLabel(data.usage.platformConnections, data.plan.limits.maxPlatformConnections)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${usagePercent(data.usage.platformConnections, data.plan.limits.maxPlatformConnections)}%`,
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Billing records</span>
                <span className="tabular-nums text-foreground">
                  {usageLabel(data.usage.billingRecords, data.plan.limits.maxBillingRecords)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${usagePercent(data.usage.billingRecords, data.plan.limits.maxBillingRecords)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available plans. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {data.plans.map((plan) => {
          const isCurrent = plan.tier === data.plan.tier;
          return (
            <Card
              key={plan.tier}
              className={cn(isCurrent && "ring-2 ring-primary/40")}
            >
              <CardContent className="flex h-full flex-col gap-4">
                <div className="space-y-1">
                  <p className="font-heading text-lg font-semibold">{plan.displayName}</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {plan.priceMonthly > 0 ? `$${plan.priceMonthly}` : "Free"}
                    {plan.priceMonthly > 0 ? (
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {plan.credits.allowance.toLocaleString()} AI credits/
                    {creditsCycleLabel(plan.credits.cycleDays)}
                  </p>
                </div>
                <ul className="flex-1 space-y-1.5 text-sm text-muted-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || switchingTo !== null}
                  onClick={() => void handleSwitch(plan)}
                >
                  {switchingTo === plan.tier ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  {isCurrent ? "Current plan" : `Switch to ${plan.displayName}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
