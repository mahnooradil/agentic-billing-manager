import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  /** When provided, renders a retry button that invokes this callback. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Presentational error panel. Interactivity (onRetry) is supplied by a client
 * boundary such as an `error.tsx` — this component itself has no side effects.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 p-10 text-center",
        className
      )}
    >
      <div className="mb-4 rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h3 className="font-heading text-base font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
