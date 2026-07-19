import { LoadingSpinner } from "@/components/common/loading-spinner";

/** Full-viewport loader shown while the session is being restored/redirected. */
export function SessionLoading() {
  return (
    <div className="grid min-h-svh place-items-center">
      <LoadingSpinner label="Loading…" />
    </div>
  );
}
