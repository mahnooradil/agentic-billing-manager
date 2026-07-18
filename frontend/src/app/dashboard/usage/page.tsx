import type { Metadata } from "next";
import { Activity } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";

export const metadata: Metadata = { title: "Usage" };

export default function UsagePage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Usage"
        description="Track consumption and usage metrics across platforms."
      />
      <EmptyState
        icon={Activity}
        title="No usage data yet"
        description="Usage metrics will appear here once platforms are connected."
      />
    </PageWrapper>
  );
}
