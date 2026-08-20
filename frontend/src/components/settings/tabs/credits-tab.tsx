"use client";

import * as React from "react";
import { Coins, Minus, Plus, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SectionHeader } from "@/components/common/section-header";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import { ApiError } from "@/services/api/client";
import { getMyCredits } from "@/services/credits/credits.service";
import type { CreditsData } from "@/services/types/credits";

type ViewStatus = "loading" | "error" | "ready";

/** Human-readable label for a ledger entry's machine-readable `reason`. */
function reasonLabel(reason: string): string {
  switch (reason) {
    case "signup_grant":
    case "signup_grant_backfill":
      return "Welcome bonus";
    case "agent_message":
      return "Billing Advisor Agent message";
    default:
      return reason;
  }
}

/** Credit balance + full usage history — how the Billing Advisor Agent's
 *  real Claude token usage is metered per message. No payment processor is
 *  wired up yet (see plan-limits' own note on that); this tab is read-only. */
export function CreditsSettingsTab() {
  const { general } = usePreferences();
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [data, setData] = React.useState<CreditsData | null>(null);
  // Captured once per fetch (in the effect, not during render) — the "pace"
  // calculation below needs a fixed "now" and must stay a pure function of
  // props/state during render (react-hooks/purity forbids `Date.now()` there).
  const [fetchedAt, setFetchedAt] = React.useState<number | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getMyCredits();
        if (ignore) return;
        setData(response.data);
        setFetchedAt(Date.now());
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

  // Average daily usage over the visible history (up to the 50 most recent
  // transactions) — a pace indicator, not a lifetime average, so it's labeled
  // "recent" rather than implying more precision than the sample supports.
  const oldestVisible = data.transactions.length
    ? data.transactions[data.transactions.length - 1]
    : null;
  const daysOfHistory = oldestVisible && fetchedAt
    ? Math.max(1, (fetchedAt - new Date(oldestVisible.createdAt).getTime()) / 86_400_000)
    : 0;
  const avgPerDay = totalUsed > 0 && daysOfHistory > 0 ? totalUsed / daysOfHistory : null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeader
          title="Credit balance"
          description={`Used by the Billing Advisor Agent — each message costs credits based on its real Claude token usage. 1 credit ≈ ${data.tokensPerCredit.toLocaleString()} tokens (input + output combined).`}
          actions={
            <Button variant="outline" disabled title="Buying credits isn't available yet">
              <ShoppingCart />
              Buy more credits
              <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Coming soon
              </span>
            </Button>
          }
        />
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
                          ? "bg-emerald-500/10 text-emerald-600"
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
                      isCredit ? "text-emerald-600" : "text-foreground"
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
    </div>
  );
}
