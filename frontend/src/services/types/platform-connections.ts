/**
 * Platform connection types — mirror the backend `/platform-connections`
 * contract (Phase F8). No secrets ever cross the wire (only `hasCredential`).
 */
export const CONNECTION_PLATFORMS = [
  "Stripe",
  "PayPal",
  "Fiverr",
  "Upwork",
  "OpenAI",
  "Anthropic",
  "Gemini",
  "OpenRouter",
] as const;
export type ConnectionPlatform = (typeof CONNECTION_PLATFORMS)[number];

export const CONNECTION_TYPES = ["oauth", "api_key", "manual"] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export const CONNECTION_STATUSES = ["connected", "disconnected", "error"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Allowed sync-frequency choices (minutes), mirroring the backend's
 *  SYNC_INTERVAL_OPTIONS_MINUTES — an explicit, bounded set rather than a
 *  free-typed number. */
export const SYNC_INTERVAL_OPTIONS_MINUTES = [15, 30, 60, 180, 360, 720, 1440] as const;
export type SyncIntervalMinutes = (typeof SYNC_INTERVAL_OPTIONS_MINUTES)[number];

export interface PlatformConnection {
  id: string;
  /** Built-in key (e.g. "Stripe") or a custom platform name. */
  platform: string;
  isCustom: boolean;
  connectionType: ConnectionType;
  status: ConnectionStatus;
  displayName: string;
  accountIdentifier: string | null;
  description: string | null;
  website: string | null;
  /** Email-sync only: sender emails/domains scanned for invoices. Empty
   *  means the whole inbox is scanned. */
  trackedSenders: string[];
  metadata: Record<string, unknown>;
  hasCredential: boolean;
  /** When the connection was last verified against the provider (null if never). */
  lastVerifiedAt: string | null;
  /** Safe message from the last failed verification (null when healthy). */
  lastError: string | null;
  /** When the most recent SYNC RUN completed, success or failure — distinct
   *  from lastVerifiedAt (the credential's own health check). */
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "error" | null;
  /** Safe message from the most recent failed sync run (null when healthy). */
  lastSyncError: string | null;
  messagesScanned: number | null;
  invoicesFound: number | null;
  /** User-chosen sync-frequency override (null = using the sync type's own
   *  default: hourly for email-sync, every 6h for billing-sync). */
  syncIntervalMinutes: SyncIntervalMinutes | null;
  createdAt: string;
  updatedAt: string;
}

/** Verify / reconnect payload — a new credential (or empty to re-check stored). */
export interface VerifyPlatformConnectionPayload {
  credential?: string;
}

/** A platform from the live Pipedream catalog. */
export interface CatalogApp {
  id: string;
  nameSlug: string;
  name: string;
  description: string | null;
  categories: string[];
  imgSrc: string | null;
  authType: string | null;
}

export interface PipedreamCatalogData {
  configured: boolean;
  apps: CatalogApp[];
}

export interface PipedreamConnectTokenData {
  token: string;
  expiresAt: string | null;
  connectLinkUrl: string | null;
}

/** Finalize payload after the browser completes the Pipedream OAuth flow. */
export interface ConnectViaPipedreamPayload {
  platform: string;
  displayName?: string;
  accountId: string;
}

export interface CreatePlatformConnectionPayload {
  platform: string;
  displayName?: string;
  accountIdentifier?: string;
  connectionType?: ConnectionType;
  status?: ConnectionStatus;
  description?: string;
  website?: string;
  metadata?: Record<string, unknown>;
  /** API key for verified connect; encrypted server-side, never returned. */
  credential?: string;
  /** How the connection was initiated (manual UI vs the AI assistant). */
  source?: "manual" | "ai_assistant";
}

export interface UpdatePlatformConnectionPayload {
  displayName?: string;
  accountIdentifier?: string;
  metadata?: Record<string, unknown>;
  trackedSenders?: string[];
  /** A new override, or `null` to clear it back to the sync type's default. */
  syncIntervalMinutes?: SyncIntervalMinutes | null;
}

export interface PlatformConnectionsData {
  connections: PlatformConnection[];
}

export interface PlatformConnectionData {
  connection: PlatformConnection;
}

export interface PlatformConnectionDeletedData {
  id: string;
}
