/**
 * Platform Connection model — Phase F8 (Platform Connections Foundation).
 *
 * A per-user, first-class record that a third-party platform (Stripe, PayPal,
 * Fiverr, Upwork, OpenAI, Anthropic, Gemini, OpenRouter) is connected to the
 * workspace. This phase is the CONNECTION LAYER ONLY — there is no OAuth, no API
 * calls, no sync, no jobs. Records are placeholders that future phases (F9/V2)
 * will consume.
 *
 * Security: raw OAuth tokens are NEVER stored. If a future phase needs a
 * credential, it is stored ENCRYPTED at rest (AES-256-GCM via utils/crypto, the
 * same mechanism as AI API keys) in `credential` (`select: false`) and never
 * returned — only `credentialLast4` powers a masked hint. The enum tuples are
 * the single source of truth shared with the validators.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

/** Curated, first-class platforms. Users may also add their OWN custom platforms
 *  (stored the same way, with `isCustom: true`), so the `platform` field is a
 *  free-form string — this list only powers the built-in catalog + defaults. */
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

/** True when a platform name is one of the curated built-ins. */
export function isBuiltInPlatform(name: string): boolean {
  return (CONNECTION_PLATFORMS as readonly string[]).includes(name);
}

/** How a platform will eventually authenticate (placeholder — nothing executes). */
export const CONNECTION_TYPES = ["oauth", "api_key", "manual"] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

/** Connection lifecycle status. */
export const CONNECTION_STATUSES = ["connected", "disconnected", "error"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** How a connection was initiated (UI-Agent). Additive + backward compatible:
 *  existing records and the manual UI default to "manual"; the AI orchestration
 *  layer stamps "ai_assistant" when it drives the connection. */
export const CONNECTION_SOURCES = ["manual", "ai_assistant"] as const;
export type ConnectionSource = (typeof CONNECTION_SOURCES)[number];

/** The connection type each platform will use by default (future-facing hint). */
export const PLATFORM_DEFAULT_CONNECTION_TYPE: Record<
  ConnectionPlatform,
  ConnectionType
> = {
  Stripe: "oauth",
  PayPal: "oauth",
  Fiverr: "oauth",
  Upwork: "oauth",
  OpenAI: "api_key",
  Anthropic: "api_key",
  Gemini: "api_key",
  OpenRouter: "api_key",
};

export interface IPlatformConnection {
  /** Owning organization — every query MUST be scoped by this (shared across
   *  every member of the organization). */
  organization: Types.ObjectId;
  /** Which member connected this account. ALSO still the Pipedream
   *  `external_user_id` for every proxy/token call on this connection — that
   *  external identity is NOT remapped to the organization, since existing
   *  Pipedream-side accounts were already created keyed by this user id and
   *  remapping would break them. */
  user: Types.ObjectId;
  /** Platform identifier — a built-in key (e.g. "Stripe") or a custom name. */
  platform: string;
  /** True for user-created custom platforms; false for curated built-ins. */
  isCustom: boolean;
  connectionType: ConnectionType;
  status: ConnectionStatus;
  displayName: string;
  /** Optional human-facing account name/id (user-entered; never a secret). */
  accountIdentifier?: string;
  /** Optional description (mainly for custom platforms). */
  description?: string;
  /** Optional website URL (mainly for custom platforms). */
  website?: string;
  /** Email-sync connections (Gmail/Outlook) only: sender email addresses or
   *  domains to scan for invoices, instead of the whole inbox — set via the
   *  Email Accounts settings tab. Empty/unset means "scan the whole inbox
   *  with generic invoice/receipt keywords" (the original, broader behavior),
   *  kept as a fallback for connections made before this existed. */
  trackedSenders?: string[];
  /** Free-form, PII-free metadata for future phases. */
  metadata: Record<string, unknown>;
  /** ENCRYPTED credential (API key / OAuth tokens). Never returned to clients. */
  credential?: string;
  /** Last 4 chars of the raw credential, for a masked hint. */
  credentialLast4: string;
  /** When the credential was last successfully verified against the provider. */
  lastVerifiedAt?: Date;
  /** Safe, secret-free message from the most recent failed verification. */
  lastError?: string;
  /** How the connection was initiated (manual UI vs the AI assistant). */
  source: ConnectionSource;
  createdAt: Date;
  updatedAt: Date;
}

export type PlatformConnectionDocument = HydratedDocument<IPlatformConnection>;
type PlatformConnectionModel = Model<IPlatformConnection>;

const platformConnectionSchema = new Schema<
  IPlatformConnection,
  PlatformConnectionModel
>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required"],
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    platform: {
      type: String,
      required: [true, "Platform is required"],
      trim: true,
      maxlength: [60, "Platform name must be at most 60 characters"],
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
    connectionType: {
      type: String,
      enum: {
        values: CONNECTION_TYPES,
        message: "Invalid connection type",
      },
      default: "manual",
    },
    status: {
      type: String,
      enum: {
        values: CONNECTION_STATUSES,
        message: "Status must be connected, disconnected, or error",
      },
      // Never fake "connected": the controller sets the real status only after a
      // successful verification (API-key) or an explicit manual connection.
      default: "disconnected",
    },
    displayName: {
      type: String,
      required: [true, "Display name is required"],
      trim: true,
      maxlength: [100, "Display name must be at most 100 characters"],
    },
    // Always populated (defaults to "") rather than left unset, so the
    // {organization, platform, accountIdentifier} unique index below behaves
    // consistently for every connection — platforms that only ever get ONE
    // connection per org (Stripe, PayPal, manual/API-key providers) keep the
    // shared "" value and stay one-per-org; platforms that legitimately have
    // several independent accounts (Gmail, Outlook — see
    // services/email-sync/registry.ts) get the real account identity here
    // instead, so multiple inboxes can coexist (see platform-connection.controller.ts).
    accountIdentifier: {
      type: String,
      trim: true,
      maxlength: [200, "Account identifier must be at most 200 characters"],
      default: "",
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Description must be at most 300 characters"],
    },
    website: {
      type: String,
      trim: true,
      maxlength: [300, "Website must be at most 300 characters"],
    },
    trackedSenders: {
      type: [String],
      default: undefined,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    credential: {
      type: String,
      select: false, // never returned by default queries
    },
    credentialLast4: {
      type: String,
      default: "",
    },
    lastVerifiedAt: {
      type: Date,
    },
    lastError: {
      type: String,
      maxlength: [500, "Error message must be at most 500 characters"],
    },
    source: {
      type: String,
      enum: {
        values: CONNECTION_SOURCES,
        message: "Invalid connection source",
      },
      default: "manual",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        delete ret.credential;
        return ret;
      },
    },
  }
);

// One connection per (platform, accountIdentifier) per organization — shared
// across every member, not duplicated per connector. For platforms with a
// single account per org, `accountIdentifier` stays "" and this behaves like
// the old {organization, platform} constraint. For multi-account platforms
// (Gmail, Outlook), `accountIdentifier` holds the real connected email, so
// several inboxes of the same platform can coexist for one organization.
platformConnectionSchema.index(
  { organization: 1, platform: 1, accountIdentifier: 1 },
  { unique: true }
);

export const PlatformConnection = model<
  IPlatformConnection,
  PlatformConnectionModel
>("PlatformConnection", platformConnectionSchema);
