import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Standard vertical rhythm + padding for a dashboard page's content column.
 * Every dashboard page renders its content inside a PageWrapper.
 */
export function PageWrapper({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8",
        className
      )}
      {...props}
    />
  );
}
