import { AlertCircle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface FormAlertProps {
  variant: "success" | "error";
  message: string;
  /** Optional list of field-level messages (e.g. backend validation errors). */
  details?: string[];
  className?: string;
}

/** Inline success/error banner used by auth forms. Presentational only. */
export function FormAlert({
  variant,
  message,
  details,
  className,
}: FormAlertProps) {
  const Icon = variant === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2 rounded-lg border p-3 text-sm",
        variant === "success"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-destructive/30 bg-destructive/10 text-destructive",
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">{message}</p>
        {details && details.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
