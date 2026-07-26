/**
 * Provider integration contracts — Phase F9.1.
 *
 * A provider adapter knows how to VERIFY a credential against a real provider
 * (API-key providers) and/or run an OAuth flow (structure only in F9.1 — no
 * provider implements OAuth yet; the shape is the extension point for F9.2).
 * Adapters are pure and provider-specific; the connection controller orchestrates
 * them. No adapter ever logs, returns, or stores a raw secret.
 */
export type AuthType = "api_key" | "oauth" | "manual";

/**
 * One field a Direct (Channel B) secure form must collect. This is metadata
 * ONLY — it describes what to ask for and where to get it; it never carries a
 * value. Secret fields use `type: "password"`. Consumed by the Capability
 * Resolver and, later, the secure credential form (UI-Agent.3).
 */
export interface FieldSpec {
  name: string;
  label: string;
  type: "password" | "text" | "url" | "select";
  required: boolean;
  placeholder?: string;
  help?: string;
  helpUrl?: string;
  /** Fixed set of valid values — present only when `type` is "select". */
  options?: { label: string; value: string }[];
}

/** What a native (Channel B) adapter needs to connect — surfaced to the AI as
 *  guidance + form spec. Contains no secret, ever. */
export interface AdapterRequirements {
  /** Human/LLM-readable summary of what's needed and what happens. */
  guidance: string;
  fields: FieldSpec[];
}

/**
 * Machine-readable health reason (UI-Agent.4) — the REAL cause behind an
 * unhealthy result, mapped from the provider response. Drives professional
 * messages and lets the assistant explain the exact state without faking it.
 */
export type VerifyReason =
  | "invalid" // key/token rejected (401/403)
  | "rate_limited" // provider throttled (429)
  | "provider_unavailable" // provider 5xx / down
  | "temporary" // network/timeout — transient
  | "revoked" // credential/account revoked
  | "needs_reauth"; // re-authentication required

/** Result of a real verification call against a provider. */
export interface VerifyResult {
  healthy: boolean;
  /** A non-secret account label surfaced by the provider (e.g. a key name). */
  accountIdentifier?: string;
  /** A safe, secret-free message when verification fails. */
  error?: string;
  /** Machine reason for the state (present when unhealthy). */
  reason?: VerifyReason;
}

export type FetchImpl = typeof fetch;

/** Injectable dependencies so verification is deterministic in tests. */
export interface AdapterDeps {
  fetchImpl?: FetchImpl;
}

/** OAuth tokens as stored (encrypted) after a successful exchange (F9.2). */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds when the access token expires, if known. */
  expiresAt?: number;
  scope?: string;
}

/**
 * OAuth flow contract. NO provider implements this in F9.1 — it exists so F9.2
 * can add real OAuth providers without touching the controller or model. The
 * controller stores the returned tokens ENCRYPTED, exactly like an API key.
 */
export interface OAuthFlow {
  getAuthUrl(params: { state: string; redirectUri: string }): string;
  exchangeCode(params: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
}

/** A registered provider adapter. */
export interface ProviderAdapter {
  /** Platform key — matches `PlatformConnection.platform` (e.g. "OpenAI"). */
  platform: string;
  authType: AuthType;
  /**
   * Verifies a credential by calling the provider for real. Present for API-key
   * adapters; absent for OAuth/manual. Deterministic in tests via `deps.fetchImpl`.
   */
  verify?(credential: string, deps?: AdapterDeps): Promise<VerifyResult>;
  /** OAuth flow — structure only in F9.1 (unset for every provider today). */
  oauth?: OAuthFlow;
  /**
   * What the Direct (Channel B) secure form must collect + where to get it.
   * Metadata only — never a value. The Capability Resolver surfaces this to the
   * AI so it can guide the user without ever seeing a credential (UI-Agent).
   */
  requirements?: AdapterRequirements;
}
