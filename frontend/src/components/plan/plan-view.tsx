"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Check, Coins, Loader2, Minus, Plus, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { useAlertState } from "@/hooks/use-alert-state";
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import { usePreferences } from "@/services/preferences/preferences-store";
import { ApiError } from "@/services/api/client";
import { getMyPlan, updateMyPlan, createPlanCheckoutSession } from "@/services/plan/plan.service";
import { getMyCredits } from "@/services/credits/credits.service";
import type { PlanData, PlanDefinition } from "@/services/types/plan";
import type { CreditsData } from "@/services/types/credits";
import { BuyCreditsDialog } from "./credits/buy-credits-dialog";

/**
 * Everything about paying for and using this app, in one place: the
 * workspace's subscription tier and its limits, the AI-credit balance and
 * usage ledger, and buying more credits. Promoted out of Settings into a
 * top-level page (VIKTOR-inspired redesign) — worth a direct destination
 * rather than a tab, since it's a distinct concept from the invoices a
 * workspace receives (see the "Invoices" nav item).
 *
 * The two halves (plan, credits) keep their own independent fetch/loading/
 * error lifecycle — they're genuinely separate API calls/cache entries —
 * they're just stacked on one page instead of two settings tabs.
 *
 * Wrapped in Suspense because `CreditsSection` reads `useSearchParams()`
 * (the Stripe checkout redirect's `?checkout=success|cancel`), which Next.js
 * requires to be Suspense-bounded.
 */
export function PlanView() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner label="Loading…" />
        </div>
      }
    >
      <PlanViewInner />
    </React.Suspense>
  );
}

function PlanViewInner() {
  return (
    <PageWrapper>
      <PageHeader
        title="Billing"
        description="Your workspace's plan, AI credit balance, and usage history."
      />
      <PlanSection />
      <CreditsSection />
    </PageWrapper>
  );
}

const PLAN_CACHE_KEY = "plan";

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

/** The workspace's OWN plan for using this app — current tier, real usage
 *  against its limits, and every tier available to switch to. Downgrading
 *  to Free is self-service and immediate; switching to a PAID tier (Pro/
 *  Business) starts a real Stripe Checkout session instead (same pattern
 *  as the credits "Buy more credits" flow below) — the tier itself only
 *  actually switches once Stripe confirms the subscription via webhook. */
function PlanSection() {
  const cached = readPageCache<PlanData>(PLAN_CACHE_KEY);
  const [status, setStatus] = React.useState<"loading" | "error" | "ready">(
    cached ? "ready" : "loading"
  );
  const [data, setData] = React.useState<PlanData | null>(cached);
  const [loadError, setLoadError] = React.useState("");
  const [switchingTo, setSwitchingTo] = React.useState<string | null>(null);
  const [alert, setAlert] = useAlertState();
  const [reloadKey, setReloadKey] = React.useState(0);
  // Deferred to an effect (not assigned directly in the click handler) for
  // the same react-hooks/immutability reason BuyCreditsDialog's identical
  // redirect is — see that component's own comment.
  const [checkoutRedirectUrl, setCheckoutRedirectUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (checkoutRedirectUrl) window.location.href = checkoutRedirectUrl;
  }, [checkoutRedirectUrl]);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getMyPlan();
        if (ignore) return;
        writePageCache(PLAN_CACHE_KEY, response.data);
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
      if (plan.tier === "Free") {
        await updateMyPlan({ tier: "Free" });
        setAlert({ type: "success", message: "Switched to the Free plan." });
        setReloadKey((key) => key + 1);
        setSwitchingTo(null);
        return;
      }

      // A paid tier is never granted directly — start real Stripe Checkout
      // and let the redirect happen; the plan switches once the webhook
      // confirms payment, same as buying credits.
      const response = await createPlanCheckoutSession(plan.tier);
      setCheckoutRedirectUrl(response.data.url);
    } catch (error) {
      setAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Could not switch plans.",
      });
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
    <section className="space-y-4">
      <SectionHeader title="Plan" description="Your workspace's subscription to this app." />
      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {data.plans.map((plan) => {
          const isCurrent = plan.tier === data.plan.tier;
          return (
            <Card key={plan.tier} className={cn(isCurrent && "ring-2 ring-primary/40")}>
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
                  {switchingTo === plan.tier ? <Loader2 className="animate-spin" /> : null}
                  {isCurrent ? "Current plan" : `Switch to ${plan.displayName}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

const CREDITS_CACHE_KEY = "credits";
interface CreditsCachePayload {
  data: CreditsData;
  fetchedAt: number;
}

/** Human-readable label for a ledger entry's machine-readable `reason`. */
function reasonLabel(reason: string): string {
  switch (reason) {
    case "signup_grant":
    case "signup_grant_backfill":
      return "Welcome bonus";
    case "agent_message":
      return "Billing Advisor Agent message";
    case "email_invoice_extraction":
      return "Email invoice check";
    case "recommendation_generation":
      return "Recommendation refresh";
    case "plan_credit_cycle_reset":
      return "Plan credit cycle reset";
    case "credit_purchase":
      return "Credit purchase";
    default:
      return reason;
  }
}

/** Credit balance + full usage history — how the Billing Advisor Agent's
 *  real Claude token usage is metered per message. Also where a workspace
 *  buys more credits directly, via Stripe Checkout (see ./credits/buy-credits-dialog.tsx). */
function CreditsSection() {
  const { general } = usePreferences();
  const searchParams = useSearchParams();
  const cached = readPageCache<CreditsCachePayload>(CREDITS_CACHE_KEY);
  const [status, setStatus] = React.useState<"loading" | "error" | "ready">(
    cached ? "ready" : "loading"
  );
  const [data, setData] = React.useState<CreditsData | null>(cached?.data ?? null);
  const [fetchedAt, setFetchedAt] = React.useState<number | null>(cached?.fetchedAt ?? null);
  const [loadError, setLoadError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [buyOpen, setBuyOpen] = React.useState(false);
  const [checkoutAlert, setCheckoutAlert] = useAlertState();

  // Stripe redirects back here with ?checkout=success|cancel — "success"
  // means the webhook has (or is about to) grant credits; "cancel" just
  // means the user backed out, nothing to report.
  const checkoutResult = searchParams.get("checkout");

  React.useEffect(() => {
    if (checkoutResult === "success") {
      setCheckoutAlert({ type: "success", message: "Payment confirmed — your credits have been added." });
    }
  }, [checkoutResult, setCheckoutAlert]);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getMyCredits();
        if (ignore) return;
        const fetchedAtNow = Date.now();
        writePageCache(CREDITS_CACHE_KEY, { data: response.data, fetchedAt: fetchedAtNow });
        setData(response.data);
        setFetchedAt(fetchedAtNow);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Failed to load your credits."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  // A one-time follow-up fetch a couple seconds after arriving from a
  // successful checkout — the webhook that actually grants credits can lag
  // slightly behind the redirect.
  React.useEffect(() => {
    if (checkoutResult !== "success") return;
    const timer = setTimeout(() => setReloadKey((key) => key + 1), 2000);
    return () => clearTimeout(timer);
  }, [checkoutResult]);

  const retry = () => {
    setStatus("loading");
    setReloadKey((key) => key + 1);
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner label="Loading your credits…" />
      </div>
    );
  }
  if (status === "error" || !data) {
    return <ErrorState description={loadError} onRetry={retry} />;
  }

  const totalGranted = data.transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalUsed = data.transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const oldestVisible = data.transactions.length
    ? data.transactions[data.transactions.length - 1]
    : null;
  const daysOfHistory = oldestVisible && fetchedAt
    ? Math.max(1, (fetchedAt - new Date(oldestVisible.createdAt).getTime()) / 86_400_000)
    : 0;
  const avgPerDay = totalUsed > 0 && daysOfHistory > 0 ? totalUsed / daysOfHistory : null;

  const cycleLabel =
    data.cycleDays === 30 ? "month" : data.cycleDays === 365 ? "year" : `${data.cycleDays} days`;

  return (
    <>
      <section className="space-y-4">
        <SectionHeader
          title="Credits"
          description={`Used by the Billing Advisor Agent — each message costs credits based on its real Claude token usage. 1 credit ≈ ${data.tokensPerCredit.toLocaleString()} tokens (input + output combined).`}
          actions={
            <Button variant="outline" onClick={() => setBuyOpen(true)}>
              <ShoppingCart />
              Buy more credits
            </Button>
          }
        />
        {checkoutAlert ? (
          <FormAlert variant={checkoutAlert.type} message={checkoutAlert.message} />
        ) : null}
        <Card>
          <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current balance</p>
              <p className="font-heading text-3xl font-semibold tabular-nums">
                {Math.max(0, data.balance)}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  credits
                </span>
              </p>
            </div>
            <div className="flex gap-8 text-sm">
              <div>
                <p className="text-muted-foreground">Plan allowance</p>
                <p className="tabular-nums font-medium text-foreground">
                  {data.allowance.toLocaleString()}/{cycleLabel}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total granted</p>
                <p className="tabular-nums font-medium text-foreground">
                  {totalGranted.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total used</p>
                <p className="tabular-nums font-medium text-foreground">
                  {totalUsed.toLocaleString()}
                </p>
              </div>
              {avgPerDay !== null ? (
                <div>
                  <p className="text-muted-foreground">Recent pace</p>
                  <p className="tabular-nums font-medium text-foreground">
                    ~{avgPerDay < 1 ? avgPerDay.toFixed(1) : Math.round(avgPerDay)}/day
                  </p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="History"
          description="Every credit grant and use, most recent first."
        />
        {data.transactions.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No credit activity yet"
            description="Once you use the Billing Advisor Agent, usage will show up here."
          />
        ) : (
          <Card className="divide-y overflow-hidden p-0">
            {data.transactions.map((txn) => {
              const isCredit = txn.amount >= 0;
              return (
                <div
                  key={txn.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex items-center gap-3.5">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl",
                        isCredit
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {isCredit ? <Plus className="size-4" /> : <Minus className="size-4" />}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{reasonLabel(txn.reason)}</p>
                      <p
                        className="text-xs text-muted-foreground"
                        title={formatDateTime(txn.createdAt, general)}
                      >
                        {formatRelativeTime(txn.createdAt, general)} · Balance after:{" "}
                        {txn.balanceAfter}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      isCredit ? "text-primary" : "text-foreground"
                    )}
                  >
                    {isCredit ? "+" : ""}
                    {txn.amount}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <BuyCreditsDialog open={buyOpen} onOpenChange={setBuyOpen} />
    </>
  );
}
