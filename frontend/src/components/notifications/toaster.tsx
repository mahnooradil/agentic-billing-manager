"use client";

import * as React from "react";
import {
  Info,
  CircleCheck,
  TriangleAlert,
  CircleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  toastStore,
  type ToastItem,
  type ToastType,
} from "@/components/notifications/toast-store";

const TYPE_META: Record<ToastType, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: "text-foreground" },
  success: {
    icon: CircleCheck,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    icon: TriangleAlert,
    className: "text-amber-600 dark:text-amber-400",
  },
  error: { icon: CircleAlert, className: "text-destructive" },
};

/**
 * Global toast viewport (Phase F2.1). Renders the toast queue top-right. Toasts
 * auto-dismiss from the store; clicking one runs its handler (open the
 * Notification Center) then dismisses. Mounted once in the dashboard shell.
 */
export function Toaster() {
  const toasts = React.useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getServerSnapshot
  );

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const meta = TYPE_META[toast.type];
  const Icon = meta.icon;
  const clickable = Boolean(toast.onClick);

  const handleClick = () => {
    toast.onClick?.();
    toastStore.dismiss(toast.id);
  };

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/5 transition",
        clickable && "cursor-pointer hover:bg-muted/50"
      )}
      onClick={clickable ? handleClick : undefined}
      role={clickable ? "button" : "status"}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.message ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {toast.message}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="-mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          toastStore.dismiss(toast.id);
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
