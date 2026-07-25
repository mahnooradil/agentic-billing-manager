/**
 * Capability Resolver (UI-Agent.1).
 *
 * The single, DYNAMIC source of truth for "is a platform supported, and how do
 * I connect it?" — merging the native adapter registry (Channel B) with the live
 * Pipedream catalog (Channel A). Provider requirements are NEVER hardcoded: they
 * come from the adapter's own `requirements` metadata or from Pipedream's app
 * `auth_type`. Adding providers requires no change here.
 *
 * Security: this layer handles METADATA ONLY (names, auth types, field specs,
 * where-to-get URLs). It never receives, returns, or logs a credential — it just
 * tells the AI what to ask for and which secure channel to use.
 */
import { findAdapter, listAdapters } from "@/services/integrations/registry";
import {
  isPipedreamConfigured,
  searchApps,
  type CatalogApp,
} from "@/services/integrations/pipedream";
import type { FieldSpec } from "@/services/integrations/types";

export type PlatformSource = "native" | "pipedream";
export type ResolvedAuthType = "oauth" | "keys" | "api_key";
export type ConnectionMethod =
  | "pipedream_oauth"
  | "pipedream_keys"
  | "direct_form";

/** A supported platform surfaced to the AI (never any secret). */
export interface PlatformMatch {
  /** The key we connect by: native adapter platform, or Pipedream app slug. */
  platform: string;
  displayName: string;
  source: PlatformSource;
  authType: ResolvedAuthType;
  description?: string;
}

/** How to connect a specific platform — guidance + (for Channel B) field spec. */
export interface ConnectionRequirements {
  supported: boolean;
  platform: string;
  displayName?: string;
  source?: PlatformSource;
  authType?: ResolvedAuthType;
  /** Which secure channel completes the connection. */
  method?: ConnectionMethod;
  /** Field spec — present ONLY for `direct_form` (native Channel B). */
  fields?: FieldSpec[];
  /** Human/LLM-readable explanation of what happens and what's needed. */
  guidance: string;
  /** Where to obtain each field (Channel B only). */
  whereToGet?: { field: string; url: string; note?: string }[];
}

// ── Short-TTL in-memory cache for Pipedream catalog lookups. ──
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const catalogCache = new Map<string, { at: number; apps: CatalogApp[] }>();

/** Cached Pipedream search. Returns [] when Pipedream is unconfigured or fails —
 *  native connectors still resolve, so the assistant degrades gracefully. */
async function cachedSearch(query: string): Promise<CatalogApp[]> {
  if (!isPipedreamConfigured()) return [];
  const key = query.trim().toLowerCase();
  const hit = catalogCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.apps;
  try {
    const apps = await searchApps(query);
    catalogCache.set(key, { at: Date.now(), apps });
    return apps;
  } catch {
    return [];
  }
}

/** Normalizes a Pipedream `auth_type` to our resolved auth vocabulary. */
function normalizePipedreamAuth(authType: string | null): ResolvedAuthType {
  return authType?.toLowerCase() === "oauth" ? "oauth" : "keys";
}

/** Native adapters whose name matches the query (case-insensitive substring). */
function nativeMatches(query: string): PlatformMatch[] {
  const q = query.trim().toLowerCase();
  return listAdapters()
    .filter((a) => !q || a.platform.toLowerCase().includes(q))
    .map((a) => ({
      platform: a.platform,
      displayName: a.platform,
      source: "native" as const,
      authType: a.authType === "api_key" ? ("api_key" as const) : ("keys" as const),
      description: a.requirements?.guidance,
    }));
}

/**
 * Searches supported platforms across both channels. Native connectors are
 * listed first (we verify them ourselves); Pipedream apps fill the long tail,
 * de-duplicated against native names.
 */
export async function searchSupportedPlatforms(
  query: string,
  limit = 20
): Promise<PlatformMatch[]> {
  const native = nativeMatches(query);
  const nativeNames = new Set(native.map((m) => m.platform.toLowerCase()));

  const apps = await cachedSearch(query);
  const pipedream: PlatformMatch[] = apps
    .filter(
      (a) =>
        !nativeNames.has(a.nameSlug.toLowerCase()) &&
        !nativeNames.has(a.name.toLowerCase())
    )
    .map((a) => ({
      platform: a.nameSlug,
      displayName: a.name,
      source: "pipedream" as const,
      authType: normalizePipedreamAuth(a.authType),
      description: a.description ?? undefined,
    }));

  return [...native, ...pipedream].slice(0, limit);
}

/** Builds `whereToGet` from a field spec's help URLs. */
function whereToGet(fields: FieldSpec[]) {
  return fields
    .filter((f) => f.helpUrl)
    .map((f) => ({ field: f.name, url: f.helpUrl as string, note: f.help }));
}

/**
 * Resolves exactly how to connect one platform. Native adapters win (Channel B,
 * direct secure form); otherwise the live Pipedream catalog decides Channel A
 * (OAuth or vaulted keys — Pipedream collects the fields, so none are returned).
 */
export async function getConnectionRequirements(
  platform: string
): Promise<ConnectionRequirements> {
  const name = platform.trim();

  // Channel B — native adapter (we verify + store, encrypted, ourselves).
  const adapter = findAdapter(name);
  if (adapter?.requirements) {
    return {
      supported: true,
      platform: adapter.platform,
      displayName: adapter.platform,
      source: "native",
      authType: adapter.authType === "api_key" ? "api_key" : "keys",
      method: "direct_form",
      fields: adapter.requirements.fields,
      guidance: adapter.requirements.guidance,
      whereToGet: whereToGet(adapter.requirements.fields),
    };
  }

  // Channel A — Pipedream managed connection (OAuth or vaulted keys).
  const apps = await cachedSearch(name);
  const q = name.toLowerCase();
  const match =
    apps.find((a) => a.nameSlug.toLowerCase() === q) ??
    apps.find((a) => a.name.toLowerCase() === q) ??
    apps[0];

  if (match) {
    const authType = normalizePipedreamAuth(match.authType);
    return {
      supported: true,
      platform: match.nameSlug,
      displayName: match.name,
      source: "pipedream",
      authType,
      method: authType === "oauth" ? "pipedream_oauth" : "pipedream_keys",
      guidance:
        authType === "oauth"
          ? `${match.name} connects through a secure Pipedream popup where you sign in to ${match.name} directly. Your credentials stay with the provider and Pipedream — this app never sees them.`
          : `${match.name} connects through a secure Pipedream popup that collects and vaults the required fields. This app never sees your credentials.`,
    };
  }

  return {
    supported: false,
    platform: name,
    guidance: `${name} isn't available yet through a native connector or Pipedream. It can't be connected automatically right now.`,
  };
}
