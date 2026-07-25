/**
 * Toast queue — a framework-agnostic external store (Phase F2.1), consumed via
 * `useSyncExternalStore` (same pattern as `authStore`). Supports multiple queued
 * toasts, auto-dismiss, an optional click handler, and typed variants.
 */
export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  /** Optional click handler (e.g. open the Notification Center). */
  onClick?: () => void;
}

export interface ToastInput {
  type: ToastType;
  title: string;
  message?: string;
  onClick?: () => void;
}

/** How long a toast stays before auto-dismissing. */
const AUTO_DISMISS_MS = 4000;
/** Cap the visible stack so a burst can't flood the screen. */
const MAX_VISIBLE = 4;

let toasts: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

// Stable empty reference for SSR (no toasts on the server).
const SERVER_SNAPSHOT: ToastItem[] = [];
function getServerSnapshot(): ToastItem[] {
  return SERVER_SNAPSHOT;
}

function dismiss(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

function push(input: ToastInput): string {
  counter += 1;
  const id = `toast-${counter}`;
  toasts = [...toasts, { id, ...input }].slice(-MAX_VISIBLE);
  emit();
  timers.set(
    id,
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
  );
  return id;
}

export const toastStore = {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  push,
  dismiss,
};

/** Convenience API mirroring common toast libraries (no dependency added). */
export const toast = {
  info: (title: string, opts?: Omit<ToastInput, "type" | "title">) =>
    push({ type: "info", title, ...opts }),
  success: (title: string, opts?: Omit<ToastInput, "type" | "title">) =>
    push({ type: "success", title, ...opts }),
  warning: (title: string, opts?: Omit<ToastInput, "type" | "title">) =>
    push({ type: "warning", title, ...opts }),
  error: (title: string, opts?: Omit<ToastInput, "type" | "title">) =>
    push({ type: "error", title, ...opts }),
};
