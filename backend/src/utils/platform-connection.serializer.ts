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
  metadata: Record<string, unknown>;
  /** True once an (encrypted) credential has been stored. */
  hasCredential: boolean;
  /** When the connection was last successfully verified (null if never). */
  lastVerifiedAt: Date | null;
  /** Safe message from the last failed verification (null when healthy). */
  lastError: string | null;
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
    metadata: (doc.metadata as Record<string, unknown>) ?? {},
    hasCredential: Boolean(doc.credentialLast4),
    lastVerifiedAt: doc.lastVerifiedAt ?? null,
    lastError: doc.lastError ?? null,
    source: doc.source ?? "manual",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
