import { LoadingSpinner } from "@/components/common/loading-spinner";

/** Route-level loading UI for the dashboard segment. */
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <LoadingSpinner label="Loading…" />
    </div>
  );
}
