/**
 * Preferences store — a framework-agnostic single source of truth for the user's
 * application settings (Phase F7), consumed via `useSyncExternalStore` (same
 * pattern as the auth and notification stores).
 *
 * It lazy-loads GET /settings once when the first consumer subscribes, caches the
 * result, and lets the Settings page push updates in (`setSettings`) after a save
 * so every consumer (formatters, defaults) reflects the change instantly. Failure
 * is non-fatal: consumers keep the sensible client defaults.
 */
import * as React from "react";

import { getUserSettings } from "@/services/settings/settings.service";
import {
  DEFAULT_USER_SETTINGS,
  toUserSettings,
  type UserSettings,
} from "@/services/types/settings";

interface PreferencesSnapshot {
  settings: UserSettings;
  loaded: boolean;
}

const DEFAULT_SNAPSHOT: PreferencesSnapshot = {
  settings: DEFAULT_USER_SETTINGS,
  loaded: false,
};

let snapshot: PreferencesSnapshot = DEFAULT_SNAPSHOT;
const listeners = new Set<() => void>();

let hasFetched = false;
let inFlight = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: PreferencesSnapshot): void {
  snapshot = next;
  emit();
}

async function load(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const response = await getUserSettings();
    setSnapshot({ settings: toUserSettings(response.data.settings), loaded: true });
  } catch {
    // Keep defaults; a later save or refresh can populate real values.
  } finally {
    inFlight = false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Fetch once, lazily, when the first consumer mounts.
  if (!hasFetched) {
    hasFetched = true;
    void load();
  }
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PreferencesSnapshot {
  return snapshot;
}

function getServerSnapshot(): PreferencesSnapshot {
  return DEFAULT_SNAPSHOT;
}

/** Replace the cached settings (called by the Settings page after a save). */
function setSettings(settings: UserSettings): void {
  setSnapshot({ settings, loaded: true });
}

/** Force a re-fetch from the server. */
function refresh(): Promise<void> {
  return load();
}

export const preferencesStore = {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  setSettings,
  refresh,
};

/** Hook: the user's current settings (client defaults until loaded). */
export function usePreferences(): UserSettings {
  const snap = React.useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.getSnapshot,
    preferencesStore.getServerSnapshot
  );
  return snap.settings;
}
