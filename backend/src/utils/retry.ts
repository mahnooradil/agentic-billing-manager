/**
 * Bounded retry with exponential backoff + jitter (UI-Agent.4).
 *
 * Production resilience for TRANSIENT failures only (network blips, provider
 * downtime, timeouts). Never retries indefinitely and never retries client
 * errors (invalid key, rate limit) — those are terminal and retrying would only
 * amplify load. Callers pass `shouldRetry` to classify.
 */

/** Resolves after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  /** Extra attempts after the first (default 2 → up to 3 tries total). */
  retries?: number;
  /** Base backoff in ms; doubles each attempt (default 300). */
  baseMs?: number;
  /** Ceiling for a single backoff wait (default 4000). */
  maxDelayMs?: number;
  /** Return true to retry a thrown error; default retries everything. */
  shouldRetry?: (error: unknown) => boolean;
}

/** Runs `fn`, retrying transient failures with capped exponential backoff. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseMs = options.baseMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 4000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = options.shouldRetry ? options.shouldRetry(error) : true;
      if (attempt === retries || !retryable) break;
      const backoff = Math.min(baseMs * 2 ** attempt, maxDelayMs);
      const jitter = Math.random() * backoff * 0.25;
      await sleep(backoff + jitter);
    }
  }
  throw lastError;
}
