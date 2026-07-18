import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  /** Extra classes applied to the spinner icon (e.g. a custom size). */
  className?: string;
  /** Optional caption rendered under the spinner. */
  label?: string;
}

/** Simple centered loading indicator used by Suspense/loading boundaries. */
export function LoadingSpinner({ className, label }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 p-10 text-muted-foreground"
    >
      <Loader2 className={cn("size-6 animate-spin", className)} />
      {label ? <p className="text-sm">{label}</p> : null}
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
