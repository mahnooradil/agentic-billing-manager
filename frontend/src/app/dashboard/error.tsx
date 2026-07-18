"use client";

import { ErrorState } from "@/components/common/error-state";
import { PageWrapper } from "@/components/common/page-wrapper";

/** Route-level error boundary for the dashboard segment. */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageWrapper>
      <ErrorState onRetry={reset} />
    </PageWrapper>
  );
}
