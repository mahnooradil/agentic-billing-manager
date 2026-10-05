/**
 * Converts a platform connection document into the wire shape. The encrypted
 * `credential` is NEVER included — only `hasCredential` (a boolean) is exposed,
 * mirroring how AI settings hides the API key.
 */
import type {
  ConnectionType,
  ConnectionStatus,
  ConnectionSource,
  PlatformConnectionDocument,
  SyncIntervalMinutes,
} from "@/models/platform-connection.model";

export interface PublicPlatformConnection {
  id: string;
  platform: string;
  isCustom: boolean;
  connectionType: ConnectionType;
  status: ConnectionStatus;
  displayName: string;
  accountIdentifier: string | null;
  description: string | null;
  website: string | null;
  /** Email-sync only: sender emails/domains scanned for invoices. Empty means
   *  the whole inbox is scanned (see the model's own docstring). */
  trackedSenders: string[];
  metadata: Record<string, unknown>;
  /** True once an (encrypted) credential has been stored. */
  hasCredential: boolean;
  /** When the connection was last successfully verified (null if never). */
  lastVerifiedAt: Date | null;
  /** Safe message from the last failed verification (null when healthy). */
  lastError: string | null;
  /** When the most recent SYNC RUN completed, success or failure — distinct
   *  from lastVerifiedAt (the credential's own health check). */
  lastSyncAt: Date | null;
  lastSyncStatus: "success" | "error" | null;
  /** Safe message from the most recent failed sync run (null when healthy). */
  lastSyncError: string | null;
  messagesScanned: number | null;
  invoicesFound: number | null;
  /** User-chosen sync-frequency override (null = using the sync type's own
   *  default — see services/platform-connections/sync-schedule.ts). */
  syncIntervalMinutes: SyncIntervalMinutes | null;
  /** How the connection was initiated (manual UI vs the AI assistant). */
  source: ConnectionSource;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicPlatformConnection(
  doc: PlatformConnectionDocument
): PublicPlatformConnection {
  return {
    id: doc._id.toString(),
    platform: doc.platform,
    isCustom: doc.isCustom,
    connectionType: doc.connectionType,
    status: doc.status,
    displayName: doc.displayName,
    accountIdentifier: doc.accountIdentifier ?? null,
    description: doc.description ?? null,
    website: doc.website ?? null,
    trackedSenders: doc.trackedSenders ?? [],
    metadata: (doc.metadata as Record<string, unknown>) ?? {},
    hasCredential: Boolean(doc.credentialLast4),
    lastVerifiedAt: doc.lastVerifiedAt ?? null,
    lastError: doc.lastError ?? null,
    lastSyncAt: doc.lastSyncAt ?? null,
    lastSyncStatus: doc.lastSyncStatus ?? null,
    lastSyncError: doc.lastSyncError ?? null,
    messagesScanned: doc.messagesScanned ?? null,
    invoicesFound: doc.invoicesFound ?? null,
    syncIntervalMinutes: doc.syncIntervalMinutes ?? null,
    source: doc.source ?? "manual",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
