import type { Metadata } from "next";
import { Activity, Boxes, CreditCard, Inbox, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { StatCard } from "@/components/common/stat-card";

export const metadata: Metadata = { title: "Overview" };

// Static placeholder values — real data is wired up in a later phase.
const stats = [
  { label: "Connected Platforms", value: "—", hint: "Awaiting integration", icon: Boxes },
  { label: "Monthly Spend", value: "—", hint: "Awaiting integration", icon: CreditCard },
  { label: "Active Usage", value: "—", hint: "Awaiting integration", icon: Activity },
  { label: "AI Insights", value: "—", hint: "Coming soon", icon: Sparkles },
];

export default function OverviewPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Overview"
        description="A snapshot of your billing workspace. Live data connects in a later phase."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            icon={stat.icon}
          />
        ))}
      </div>

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
