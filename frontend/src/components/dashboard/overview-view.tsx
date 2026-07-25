"use client";

import * as React from "react";
import {
  Boxes,
  CircleCheck,
  CircleX,
  Receipt,
  Wallet,
  CircleAlert,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { StatCard } from "@/components/common/stat-card";
import { ApiError } from "@/services/api/client";
import { formatNumber } from "@/lib/format";
import { getDashboardStats } from "@/services/dashboard/dashboard.service";
import { getBillingStats } from "@/services/billing/billing.service";
import { useAuth } from "@/hooks/use-auth";
import type { DashboardStats } from "@/services/types/dashboard";
import type { BillingStats } from "@/services/types/billing";

type ViewStatus = "loading" | "error" | "ready";

/**
 * Overview screen: a real snapshot of the workspace. Fetches live platform and
 * billing statistics from existing endpoints and renders them in the shared
 * StatCard grid. Money is formatted through the shared formatting layer.
 */
export function OverviewView() {
  const { user } = useAuth();
  const firstName = user?.fullName?.trim().split(/\s+/)[0];

  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [platformStats, setPlatformStats] =
    React.useState<DashboardStats | null>(null);
  const [billingStats, setBillingStats] = React.useState<BillingStats | null>(
    null
  );
  const [loadError, setLoadError] = React.useState("");

  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        // Platform stats drive the page; billing stats are an enhancement and
        // must never fail the page if unavailable.
        const [dashboard, billing] = await Promise.all([
          getDashboardStats(),
          getBillingStats().catch(() => null),
        ]);
        if (ignore) return;
        setPlatformStats(dashboard.data.stats);
        setBillingStats(billing?.data.stats ?? null);
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

  const isEmpty =
    platformStats?.totalPlatforms === 0 &&
    (billingStats?.totalRecords ?? 0) === 0;

  return (
    <PageWrapper>
      {/* Premium welcome hero. */}
      <div className="relative isolate overflow-hidden rounded-2xl bg-brand-gradient p-6 text-primary-foreground shadow-e2 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-aurora absolute -top-16 -right-10 size-64 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:20px_20px]" />
        </div>
        <div className="relative space-y-2">
          <p className="text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
            Welcome back
          </p>
          <h1 className="font-heading text-2xl font-semibold text-balance sm:text-3xl">
            {firstName ? `Hello, ${firstName}` : "Your billing workspace"}
          </h1>
          <p className="max-w-lg text-sm text-white/80">
            Here&apos;s a live snapshot of everything you&apos;re billed on —
            platforms, invoices, and revenue at a glance.
          </p>
        </div>
      </div>

      {status === "loading" ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner label="Loading statistics…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : isEmpty ? (
        <EmptyState
          icon={Boxes}
          title="Nothing to show yet"
          description="Add a billing platform and your first invoice to see live statistics here."
        />
      ) : platformStats ? (
        <>
          <section className="space-y-4">
            <SectionHeader
              title="Platforms"
              description="The services your billing is organized by."
            />
            <div className="reveal-group grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Total Platforms"
                value={String(platformStats.totalPlatforms)}
                hint="All platforms"
                icon={Boxes}
              />
              <StatCard
                label="Active Platforms"
                value={String(platformStats.activePlatforms)}
                hint="Currently active"
                icon={CircleCheck}
              />
              <StatCard
                label="Inactive Platforms"
                value={String(platformStats.inactivePlatforms)}
                hint="Currently inactive"
                icon={CircleX}
              />
            </div>
          </section>

          {billingStats ? (
            <section className="space-y-4">
              <SectionHeader
                title="Billing"
                description="Your invoices at a glance."
              />
              <div className="reveal-group grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Total Invoices"
                  value={String(billingStats.totalRecords)}
                  hint="All billing records"
                  icon={Receipt}
                />
                <StatCard
                  label="Total Revenue"
                  value={formatNumber(billingStats.totalRevenue)}
                  hint="Paid invoices"
                  icon={Wallet}
                />
                <StatCard
                  label="Overdue"
                  value={String(billingStats.overdueRecords)}
                  hint="Past due invoices"
                  icon={CircleAlert}
                />
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </PageWrapper>
  );
}
