/**
 * In-memory, per-tab cache for dashboard page data — lets a view seed its
 * initial state from the last successful fetch instead of always starting at
 * "loading," so navigating away and back (Platforms → Analytics → Platforms,
 * or any Settings tab) shows the previous result instantly instead of
 * blanking the page out again for data that's very likely unchanged.
 *
 * Lives for the whole tab session (until logout/login or a hard refresh) —
 * NOT time-limited. A page that already has cached data never shows a
 * loading spinner again on remount; the underlying fetch still runs every
 * time, quietly, and swaps in anything that changed once it resolves.
 * Deliberately module-level (not localStorage) — it should never survive a
 * hard refresh or leak into another tab.
 */

const cache = new Map<string, unknown>();

/** Reads a cached value for this key, or null if nothing's been cached yet. */
export function readPageCache<T>(key: string): T | null {
  return cache.has(key) ? (cache.get(key) as T) : null;
}

export function writePageCache<T>(key: string, data: T): void {
  cache.set(key, data);
}

/** Drops one entry, or everything when no key is given — call on logout/login
 *  so a same-tab account switch can never show the previous account's data. */
export function invalidatePageCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}
