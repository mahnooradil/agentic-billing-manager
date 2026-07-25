import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "shimmer relative overflow-hidden rounded-lg bg-muted/70",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
