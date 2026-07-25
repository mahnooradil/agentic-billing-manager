/**
 * Shared verification helpers for provider adapters (Phase F9.1; hardened in
 * UI-Agent.4).
 *
 * Every API-key adapter verifies a credential the same way: a short, timed GET
 * to a lightweight provider endpoint, mapping the HTTP status to a safe,
 * secret-free `VerifyResult` with a machine `reason`. TRANSIENT failures
 * (network/timeout/5xx) are retried with bounded backoff; terminal ones
 * (invalid key, rate limit) are returned immediately — retrying would only add
 * load. Provider error bodies are NEVER forwarded (they can echo key
 * fragments); the credential is never logged.
 */
import { sleep } from "@/utils/retry";
import type { AdapterDeps, VerifyResult } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 300;

interface VerifyGetOptions {
  url: string;
  headers: Record<string, string>;
  deps?: AdapterDeps;
  timeoutMs?: number;
  /** Extracts a non-secret account label from a successful response body. */
  onOk?: (data: unknown) => { accountIdentifier?: string } | undefined;
}

/** One timed GET attempt, mapped to a result + whether it's worth retrying. */
async function attempt(
  options: VerifyGetOptions
): Promise<{ result: VerifyResult; transient: boolean }> {
  const doFetch = options.deps?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await doFetch(options.url, {
      method: "GET",
      headers: options.headers,
      signal: controller.signal,
    });
  } catch {
    // Network error or timeout (abort) — transient, worth a retry.
    return {
      result: {
        healthy: false,
        reason: "temporary",
        error: "Could not reach the provider. Please try again shortly.",
      },
      transient: true,
    };
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) {
    let extra: { accountIdentifier?: string } | undefined;
    if (options.onOk) {
      try {
        extra = options.onOk(await response.json());
      } catch {
        /* a healthy status is enough; ignore body parse issues */
      }
    }
    return { result: { healthy: true, ...(extra ?? {}) }, transient: false };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      result: {
        healthy: false,
        reason: "invalid",
        error:
          "The provider rejected this API key. Please check the key and try again.",
      },
      transient: false,
    };
  }
  if (response.status === 429) {
    return {
      result: {
        healthy: false,
        reason: "rate_limited",
        error:
          "The provider rate limit was reached. Please try again in a little while.",
      },
      transient: false,
    };
  }
  if (response.status >= 500) {
    return {
      result: {
        healthy: false,
        reason: "provider_unavailable",
        error: "The provider is temporarily unavailable. Please try again shortly.",
      },
      transient: true,
    };
  }
  return {
    result: {
      healthy: false,
      reason: "invalid",
      error: "The provider could not verify this key. Please check it and retry.",
    },
    transient: false,
  };
}

/** Performs a timed GET (with bounded retry on transient failures) and maps the
 *  response to a VerifyResult. */
export async function verifyViaGet(
  options: VerifyGetOptions
): Promise<VerifyResult> {
  let last: VerifyResult = {
    healthy: false,
    reason: "temporary",
    error: "Could not reach the provider. Please try again shortly.",
  };

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const { result, transient } = await attempt(options);
    if (!transient) return result;
    last = result;
    if (i < MAX_ATTEMPTS) {
      const backoff = BASE_BACKOFF_MS * 2 ** (i - 1);
      await sleep(backoff + Math.random() * backoff * 0.25);
    }
  }
  return last;
}
