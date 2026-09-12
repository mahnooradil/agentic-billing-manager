/**
 * Notification Store — framework-agnostic single source of truth (Phase F2.1),
 * consumed via `useSyncExternalStore` (same pattern as `authStore`).
 *
 * Responsibilities:
 *  - Holds the notification list + unread count + last-updated.
 *  - Polls every 20s as a BACKUP (ref-counted: runs only while something is
 *    subscribed) and refreshes INSTANTLY when the API client reports a mutation
 *    (`data:mutated`) — so the bell badge updates without waiting for a poll.
 *  - Detects genuinely new, unread notifications (diff by id) and enqueues a
 *    toast for each — deduped by id, and never on the initial load.
 *
 * Future-ready: a WebSocket/SSE layer only needs to call `notificationStore
 * .refresh()` (or emit `notification:incoming`) — the UI and this store are
 * unchanged.
 */
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
} from "@/services/notifications/notification.service";
import type { Notification } from "@/services/types/notifications";
import { onClientEvent, emitClientEvent } from "@/services/events/client-events";
import { toast, type ToastType } from "@/components/notifications/toast-store";

export type NotificationStatus = "loading" | "ready" | "error";

export interface NotificationSnapshot {
  notifications: Notification[];
  unreadCount: number;
  lastUpdatedAt: string | null;
  status: NotificationStatus;
}

// Matches the top-of-file docstring's "20s BACKUP" — was accidentally left at
// 5s, which meant every open dashboard tab hit the backend 4x more often than
// intended, all the time the app is open, competing with real user requests
// for no benefit (the mutation-burst below already delivers same-user updates
// in ~1s; this poll only exists to catch background/other-user changes).
const POLL_INTERVAL_MS = 20_000;
// After a mutation by the current user, the backend creates the notification
// ASYNCHRONOUSLY (fire-and-forget engine), so an immediate refresh can run before
// it exists. A dense, fast burst catches the common case (billing/platform rules,
// no AI call) within ~1s of it being persisted, and keeps checking with backoff
// for the slower AI-recommendation path — so the 20s poll is a rare fallback, not
// the normal delivery path. No WebSockets/SSE.
const MUTATION_REFRESH_DELAYS_MS = [
  150, 400, 700, 1000, 1500, 2200, 3200, 4500, 6000, 8000, 10500, 13500, 17000,
];

const LOADING_SNAPSHOT: NotificationSnapshot = {
  notifications: [],
  unreadCount: 0,
  lastUpdatedAt: null,
  status: "loading",
};

let snapshot: NotificationSnapshot = LOADING_SNAPSHOT;
const listeners = new Set<() => void>();

// Toast/dedup bookkeeping.
let knownIds = new Set<string>();
let initialized = false;
let inFlight = false;
let refreshQueued = false;

// Lifecycle handles (poll + mutation subscription), started on first subscriber.
let subscriberCount = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let mutationTimers: ReturnType<typeof setTimeout>[] = [];
let unsubscribeMutations: (() => void) | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: NotificationSnapshot): void {
  snapshot = next;
  emit();
}

/** Maps a notification to a toast variant per the approved mapping. */
function toastTypeFor(n: Notification): ToastType {
  if (n.severity === "critical") return "error";
  if (n.severity === "warning") return "warning";
  if (n.title.toLowerCase().includes("resolved")) return "success";
  return "info";
}

function fireToastFor(n: Notification): void {
  toast[toastTypeFor(n)](n.title, {
    message: n.message,
    // Clicking a toast opens the Notification Center (decoupled via a client event).
    onClick: () => emitClientEvent("notification:open"),
  });
}

/**
 * Fetches the latest notifications; toasts any new, unread ones (never on load).
 * Single-flight WITH a trailing re-run: a refresh requested while one is already
 * in flight is not dropped — it runs once more immediately after, so burst ticks
 * during the async backend write are never lost.
 */
async function refresh(): Promise<void> {
  if (inFlight) {
    refreshQueued = true;
    return;
  }
  inFlight = true;
  try {
    const res = await getNotifications("all");
    const list = res.data.notifications;

    if (initialized) {
      for (const n of list) {
        if (!knownIds.has(n.id) && !n.read) fireToastFor(n);
      }
    }
    knownIds = new Set(list.map((n) => n.id));
    initialized = true;

    setSnapshot({
      notifications: list,
      unreadCount: res.data.meta.unreadCount,
      lastUpdatedAt: res.data.meta.lastUpdatedAt,
      status: "ready",
    });
  } catch {
    if (snapshot.status === "loading") {
      setSnapshot({ ...snapshot, status: "error" });
    }
    // Otherwise keep the last good snapshot; the next poll will retry.
  } finally {
    inFlight = false;
    if (refreshQueued) {
      refreshQueued = false;
      void refresh();
    }
  }
}

function clearMutationTimers(): void {
  mutationTimers.forEach((t) => clearTimeout(t));
  mutationTimers = [];
}

function onMutation(): void {
  // Coalesce rapid mutations, then fire a short burst of refreshes to catch the
  // asynchronously-created notification quickly.
  clearMutationTimers();
  mutationTimers = MUTATION_REFRESH_DELAYS_MS.map((delay) =>
    setTimeout(() => void refresh(), delay)
  );
}

function startLifecycle(): void {
  void refresh();
  pollTimer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
  unsubscribeMutations = onClientEvent("data:mutated", onMutation);
}

function stopLifecycle(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  clearMutationTimers();
  unsubscribeMutations?.();
  unsubscribeMutations = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  subscriberCount += 1;
  if (subscriberCount === 1) startLifecycle();

  return () => {
    listeners.delete(listener);
    subscriberCount -= 1;
    if (subscriberCount === 0) stopLifecycle();
  };
}

function getSnapshot(): NotificationSnapshot {
  return snapshot;
}

function getServerSnapshot(): NotificationSnapshot {
  return LOADING_SNAPSHOT;
}

// Lifecycle actions — mutate on the server, then refresh so the badge/list and
// unread count stay authoritative.
async function markRead(id: string): Promise<void> {
  try {
    await markNotificationRead(id);
  } catch {
    /* reconciled on next refresh */
  }
  await refresh();
}

async function markAllRead(): Promise<void> {
  try {
    await markAllNotificationsRead();
  } catch {
    /* reconciled on next refresh */
  }
  await refresh();
}

async function archive(id: string): Promise<void> {
  try {
    await archiveNotification(id);
  } catch {
    /* reconciled on next refresh */
  }
  await refresh();
}

export const notificationStore = {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  refresh,
  markRead,
  markAllRead,
  archive,
};
