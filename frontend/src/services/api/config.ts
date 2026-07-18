/**
 * API configuration. The base URL is read from the public env var (exposed to
 * the browser) with a sensible local-dev fallback. No secrets here.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000/api";
