"use client";

import * as React from "react";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Archive,
  Receipt,
  Sparkles,
  BarChart3,
  Brain,
  TriangleAlert,
  Info,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { cn } from "@/lib/utils";
import { formatRelativeTime, formatDateTime } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import { onClientEvent } from "@/services/events/client-events";
import { notificationStore } from "@/services/notifications/notification-store";
import type {
  Notification,
  NotificationFilter,
} from "@/services/types/notifications";

const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "critical", label: "Critical" },
  { value: "billing", label: "Billing" },
  { value: "recommendation", label: "Recommendation" },
];

// ── One consistent semantic color system (no random purple/pink). ──
type ColorKey = "red" | "amber" | "emerald" | "blue" | "indigo" | "slate";

const COLOR: Record<
  ColorKey,
  { badge: string; border: string; dot: string }
> = {
  red: {
    badge: "bg-red-500/10 text-red-600 dark:text-red-400",
    border: "border-l-red-500",
    dot: "bg-red-500",
  },
  amber: {
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    border: "border-l-amber-500",
    dot: "bg-amber-500",
  },
  emerald: {
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    border: "border-l-emerald-500",
    dot: "bg-emerald-500",
  },
  blue: {
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    border: "border-l-blue-500",
    dot: "bg-blue-500",
  },
  indigo: {
    badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    border: "border-l-indigo-500",
    dot: "bg-indigo-500",
  },
  slate: {
    badge: "bg-slate-500/10 text-slate-700 dark:text-slate-400",
    border: "border-l-slate-400",
    dot: "bg-slate-400",
  },
};

// All F2 notifications are produced by the Notification Engine — a static,
// accurate "source" that needs no backend field/contract change.
const NOTIFICATION_SOURCE = "Automated";

/**
 * Resolves the icon + semantic color + type label for a notification. Icons come
 * from one family (lucide); colors come from the semantic palette above. Priority:
 * resolved (success) → critical → per-category, with warning tinting amber.
 */
function resolveMeta(n: Notification): {
  icon: LucideIcon;
  color: ColorKey;
  label: string;
} {
  const t = n.title.toLowerCase();
  if (t.includes("resolved")) return { icon: CheckCheck, color: "emerald", label: "Resolved" };
  if (n.severity === "critical") return { icon: TriangleAlert, color: "red", label: "Critical" };

  switch (n.category) {
    case "billing":
      return { icon: Receipt, color: n.severity === "warning" ? "amber" : "blue", label: "Billing" };
    case "recommendation":
      return { icon: Sparkles, color: "indigo", label: "Recommendation" };
    case "usage":
      return { icon: BarChart3, color: n.severity === "warning" ? "amber" : "blue", label: "Usage" };
    case "system":
      if (/\bai\b/.test(t)) return { icon: Brain, color: "indigo", label: "AI" };
      return { icon: Info, color: n.severity === "warning" ? "amber" : "slate", label: "System" };
    default:
      return { icon: Info, color: "slate", label: "System" };
  }
}

/** Strict newest-first: createdAt DESC (stable via id tiebreak). No exceptions. */
function sortNewestFirst(list: Notification[]): Notification[] {
  return [...list].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  );
}

/** Client-side filter over the store's (non-archived) list. */
function applyFilter(list: Notification[], filter: NotificationFilter) {
  switch (filter) {
    case "unread":
      return list.filter((n) => !n.read);
    case "critical":
      return list.filter((n) => n.severity === "critical");
    case "billing":
      return list.filter((n) => n.category === "billing");
    case "recommendation":
      return list.filter((n) => n.category === "recommendation");
    default:
      return list;
  }
}

/**
 * Notification bell + drawer. Reads everything from the shared Notification
 * Store (single source of truth) so the badge updates instantly on read /
 * archive / mark-all / new notification; a fast burst refresh gives perceived
 * real-time, with polling only as a fallback. Presentation-only (F2.2).
 */
export function NotificationCenter() {
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<NotificationFilter>("all");
  const { general } = usePreferences();

  const { notifications, unreadCount, lastUpdatedAt, status } =
    React.useSyncExternalStore(
      notificationStore.subscribe,
      notificationStore.getSnapshot,
      notificationStore.getServerSnapshot
    );

  // Open the drawer when a toast is clicked.
  React.useEffect(
    () => onClientEvent("notification:open", () => setOpen(true)),
    []
  );

  const items = applyFilter(sortNewestFirst(notifications), filter);
  const badge =
    unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative" />
        }
      >
        <Bell />
        {badge ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-background">
            {badge}
          </span>
        ) : null}
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full gap-0 border-l border-border/60 bg-background/80 p-0 backdrop-blur-2xl sm:max-w-md"
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border/60 px-5 py-4 pr-12">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-primary-foreground shadow-e1 ring-1 ring-white/15">
              <Bell className="size-4" />
            </span>
            <div className="space-y-0.5">
              <SheetTitle>Notifications</SheetTitle>
              <p className="text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void notificationStore.markAllRead()}
            disabled={unreadCount === 0}
            title="Mark all notifications as read"
          >
            <CheckCheck /> Mark all read
          </Button>
        </SheetHeader>

        <div className="flex flex-wrap gap-1.5 border-b border-border/60 px-4 py-3">
          {FILTERS.map((option) => (
            <Button
              key={option.value}
              size="xs"
              variant={filter === option.value ? "default" : "ghost"}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className="transition-all active:scale-95"
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {status === "loading" ? (
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner label="Loading notifications…" />
            </div>
          ) : status === "error" ? (
            <div className="px-6 py-20 text-center text-sm text-muted-foreground">
              Failed to load notifications.
            </div>
          ) : items.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <ul className="reveal-group divide-y divide-border/60">
              {items.map((n) => (
                <NotificationRow key={n.id} notification={n} />
              ))}
            </ul>
          )}
        </div>

        {lastUpdatedAt ? (
          <div className="border-t border-border/60 px-5 py-3 text-center text-[11px] text-muted-foreground">
            Updated {formatRelativeTime(lastUpdatedAt, general)}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EmptyState({ filter }: { filter: NotificationFilter }) {
  const label = FILTERS.find((f) => f.value === filter)?.label ?? "";
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <BellOff className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="font-heading text-base font-medium">
          {filter === "all" ? "You're all caught up" : `No ${label.toLowerCase()} notifications`}
        </p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          Alerts appear here automatically as your billing data and
          recommendations change.
        </p>
      </div>
    </div>
  );
}

function NotificationRow({ notification: n }: { notification: Notification }) {
  const { general } = usePreferences();
  const meta = resolveMeta(n);
  const c = COLOR[meta.color];
  const Icon = meta.icon;

  // Reduce recommendation repetition: headline the specific item; the badge
  // conveys that it's a recommendation.
  const isRec = n.category === "recommendation";
  const primary = isRec && n.message ? n.message : n.title;
  const secondary = isRec ? null : n.message;

  return (
    <li
      className={cn(
        "group flex gap-3.5 border-l-2 px-5 py-4 transition-colors",
        n.read
          ? "border-l-transparent hover:bg-muted/40"
          : cn(c.border, "bg-muted/30 hover:bg-muted/50")
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform group-active:scale-95",
          c.badge
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {!n.read ? (
              <span
                className={cn("size-1.5 shrink-0 rounded-full", c.dot)}
                aria-label="Unread"
              />
            ) : null}
            <p
              className={cn(
                "truncate text-sm",
                n.read ? "font-medium text-foreground/90" : "font-semibold"
              )}
            >
              {primary}
            </p>
          </div>
          <span
            className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground"
            title={formatDateTime(n.createdAt, general)}
          >
            {formatRelativeTime(n.createdAt, general)}
          </span>
        </div>

        {secondary ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{secondary}</p>
        ) : null}

        <div className="flex items-center gap-2 pt-0.5">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              c.badge
            )}
          >
            {meta.label}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {NOTIFICATION_SOURCE}
          </span>

          <div className="ml-auto flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {!n.read ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Mark as read"
                title="Mark as read"
                onClick={() => void notificationStore.markRead(n.id)}
              >
                <Check />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Archive notification"
              title="Archive (kept in history)"
              onClick={() => void notificationStore.archive(n.id)}
            >
              <Archive />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
