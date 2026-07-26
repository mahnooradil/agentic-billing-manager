/**
 * Pipedream Connect service (Phase F9.2).
 *
 * Talks to the real Pipedream Connect API (no SDK, just fetch) to:
 *  - fetch/search the live app catalog (source of truth — never hardcoded),
 *  - mint short-lived Connect tokens so the browser can run the managed OAuth
 *    flow for the current user,
 *  - look up a connected account for health/verification.
 *
 * Security: Pipedream VAULTS the provider tokens — this app never receives,
 * stores, or returns raw OAuth access/refresh tokens; it only keeps a Pipedream
 * account id reference. The Pipedream API access token is cached in memory only
 * and never logged or returned. When credentials are unset, every call throws a
 * clean "not configured" error — nothing is faked.
 */
import { env } from "@/config/env";
import { AppError } from "@/utils/appError";
import { sleep } from "@/utils/retry";

const API_BASE = "https://api.pipedream.com/v1";
const PD_TIMEOUT_MS = 12_000;
const PD_MAX_ATTEMPTS = 3;
const PD_BASE_BACKOFF_MS = 300;

/** Timed fetch with bounded retry on network/timeout/5xx (UI-Agent.4). Returns
 *  the response (caller inspects status); throws a clean 502 only when the
 *  provider is unreachable after all attempts. 4xx are returned, not retried. */
async function pdRawFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<Awaited<ReturnType<typeof fetch>>> {
  for (let attempt = 1; attempt <= PD_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PD_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.status >= 500 && attempt < PD_MAX_ATTEMPTS) {
        await sleep(PD_BASE_BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
      return res;
    } catch {
      clearTimeout(timer);
      if (attempt < PD_MAX_ATTEMPTS) {
        await sleep(PD_BASE_BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
    }
  }
  throw new AppError("Could not reach Pipedream. Please try again.", 502);
}

export interface CatalogApp {
  id: string;
  nameSlug: string;
  name: string;
  description: string | null;
  categories: string[];
  imgSrc: string | null;
  authType: string | null;
}

export interface ConnectTokenResult {
  token: string;
  expiresAt: string | null;
  connectLinkUrl: string | null;
}

export interface PipedreamAccount {
  id: string;
  app: string;
  name: string | null;
  healthy: boolean;
  /** True when Pipedream marks the account dead (credential revoked/expired). */
  revoked: boolean;
}

/** One credential field a "keys" auth-type app's Connect popup will ask for.
 *  Metadata only, parsed from Pipedream's `custom_fields_json` — never a value. */
export interface PipedreamCustomField {
  name: string;
  label: string;
  description: string | null;
  /** Pipedream's own field type, e.g. "password", "options", or unset (plain text). */
  type: string | null;
  optional: boolean;
  /** Fixed set of valid values — present only when `type` is "options". */
  options: { label: string; value: string }[] | null;
}

/** Raw Pipedream account fields we read (safe subset — never credentials). */
interface AccountShape {
  id?: string;
  external_id?: string;
  healthy?: boolean;
  /** Pipedream marks an account "dead" when its credential is revoked/expired. */
  dead?: boolean | null;
  name?: string;
  app?: { name_slug?: string; name?: string };
}

/** True when the Pipedream Connect credentials are configured. */
export function isPipedreamConfigured(): boolean {
  return Boolean(
    env.pipedreamClientId && env.pipedreamClientSecret && env.pipedreamProjectId
  );
}

function ensureConfigured(): void {
  if (!isPipedreamConfigured()) {
    throw new AppError(
      "Pipedream is not configured on the server.",
      503
    );
  }
}

// In-memory access-token cache (never persisted, never returned).
let cachedToken: { value: string; expiresAtMs: number } | null = null;

/** Gets a Pipedream API access token via the client-credentials grant (cached). */
async function getAccessToken(): Promise<string> {
  ensureConfigured();
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now) {
    return cachedToken.value;
  }
  const res = await pdRawFetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env.pipedreamClientId,
      client_secret: env.pipedreamClientSecret,
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!res.ok || !data?.access_token) {
    throw new AppError("Pipedream authentication failed.", 502);
  }
  cachedToken = {
    value: data.access_token,
    expiresAtMs: now + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/** Authenticated request to the Pipedream API with the Connect env header. */
async function pdFetch(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = await getAccessToken();
  const res = await pdRawFetch(`${API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-PD-Environment": env.pipedreamEnvironment,
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AppError("Pipedream request failed.", 502);
  }
  return data;
}

/** Searches the live Pipedream app catalog (empty query returns popular apps). */
export async function searchApps(
  query: string,
  limit = 40
): Promise<CatalogApp[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  params.set("limit", String(Math.min(Math.max(limit, 1), 100)));
  const data = (await pdFetch(`/apps?${params.toString()}`)) as {
    data?: Array<{
      id?: string;
      name_slug?: string;
      name?: string;
      description?: string;
      categories?: string[];
      img_src?: string;
      auth_type?: string;
    }>;
  } | null;
  return (data?.data ?? [])
    .filter((a) => a.id && a.name_slug && a.name)
    .map((a) => ({
      id: a.id as string,
      nameSlug: a.name_slug as string,
      name: a.name as string,
      description: a.description ?? null,
      categories: a.categories ?? [],
      imgSrc: a.img_src ?? null,
      authType: a.auth_type ?? null,
    }));
}

/**
 * Fetches and parses one app's required credential fields — only meaningful
 * for `auth_type: "keys"` apps (OAuth apps have nothing to pre-collect).
 * Lets the assistant tell the user exactly what a "keys" app's Connect popup
 * will ask for, and where to get each value, BEFORE they open it. Metadata
 * only (field names/labels/help text) — never a value. Degrades to `[]` on
 * any failure (unconfigured, unreachable, malformed) so callers can always
 * fall back to the generic guidance instead of erroring the whole turn.
 */
export async function getAppCustomFields(appId: string): Promise<PipedreamCustomField[]> {
  if (!isPipedreamConfigured()) return [];
  try {
    const detail = (await pdFetch(`/apps/${encodeURIComponent(appId)}`)) as {
      data?: { custom_fields_json?: string | null };
    } | null;
    const raw = detail?.data?.custom_fields_json;
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Array<{
      name?: string;
      label?: string;
      description?: string | null;
      type?: string;
      optional?: boolean | null;
      options?: Array<{ label?: string; value?: string }> | null;
    }>;
    return parsed
      .filter((f): f is typeof f & { name: string } => Boolean(f.name))
      .map((f) => ({
        name: f.name,
        label: f.label ?? f.name,
        description: f.description ?? null,
        type: f.type ?? null,
        optional: Boolean(f.optional),
        options: Array.isArray(f.options)
          ? f.options
              .filter(
                (o): o is { label: string; value: string } =>
                  typeof o?.label === "string" && typeof o?.value === "string"
              )
              .map((o) => ({ label: o.label, value: o.value }))
          : null,
      }));
  } catch {
    return [];
  }
}

/** Mints a short-lived Connect token so the browser can connect an account on
 *  behalf of this user (managed OAuth handled entirely by Pipedream). */
export async function createConnectToken(
  externalUserId: string
): Promise<ConnectTokenResult> {
  const allowedOrigins = env.corsOrigin
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const data = (await pdFetch(`/connect/${env.pipedreamProjectId}/tokens`, {
    method: "POST",
    body: {
      external_user_id: externalUserId,
      ...(allowedOrigins.length ? { allowed_origins: allowedOrigins } : {}),
    },
  })) as {
    token?: string;
    expires_at?: string;
    connect_link_url?: string;
  } | null;
  if (!data?.token) {
    throw new AppError("Could not start the Pipedream connection.", 502);
  }
  return {
    token: data.token,
    expiresAt: data.expires_at ?? null,
    connectLinkUrl: data.connect_link_url ?? null,
  };
}

/** Verifies a connected account exists for this user and returns safe fields. */
export async function getAccount(
  externalUserId: string,
  accountId: string
): Promise<PipedreamAccount | null> {
  // A missing/invalid account is the expected "not found" case → null, not an
  // error (Pipedream returns a non-2xx which pdFetch would otherwise 502 on).
  let raw: (AccountShape & { data?: AccountShape }) | null;
  try {
    raw = (await pdFetch(
      `/connect/${env.pipedreamProjectId}/accounts/${encodeURIComponent(
        accountId
      )}?include_credentials=false`
    )) as typeof raw;
  } catch {
    return null;
  }

  // The single-account GET returns the account at the ROOT; the list endpoint
  // nests it under `data`. Accept either shape.
  const acc: AccountShape | undefined = raw ? raw.data ?? raw : undefined;
  // Only accept accounts that belong to THIS user (never cross-user).
  if (!acc?.id || (acc.external_id && acc.external_id !== externalUserId)) {
    return null;
  }
  const revoked = Boolean(acc.dead);
  return {
    id: acc.id,
    app: acc.app?.name_slug ?? acc.app?.name ?? "",
    name: acc.name ?? null,
    // A dead account is never healthy, even if `healthy` is unset.
    healthy: acc.healthy !== false && !revoked,
    revoked,
  };
}
