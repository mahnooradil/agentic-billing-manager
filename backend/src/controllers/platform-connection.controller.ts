/**
 * Platform connection controllers — REAL connection engine (Phase F9.1).
 *
 * All routes are protected by `authenticate`. Connection RECORDS are scoped
 * to the current user's ORGANIZATION (shared across every member) — but the
 * Pipedream `external_user_id` for every proxy/token call stays the
 * CONNECTING user's id, not the organization's, since Pipedream-side accounts
 * were already created keyed by that user id and remapping would break them
 * (see the `user` field's docstring on the model). API-key providers are
 * VERIFIED against the real provider before a connection is ever marked
 * "connected" — there is no fake status. Credentials are encrypted at rest
 * (AES-256-GCM) and NEVER returned.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { encryptSecret, decryptSecret } from "@/utils/crypto";
import { toPublicPlatformConnection } from "@/utils/platform-connection.serializer";
import { getAdapter } from "@/services/integrations/registry";
import { syncConnectionBilling } from "@/services/billing-sync/sync-engine";
import { syncConnectionEmail } from "@/services/email-sync/sync-engine";
import { isEmailSyncPlatform } from "@/services/email-sync/registry";
import { assertPlatformConnectionLimit } from "@/utils/plan-limits";
import {
  searchApps,
  createConnectToken,
  getAccount,
  isPipedreamConfigured,
} from "@/services/integrations/pipedream";
import {
  PlatformConnection,
  PLATFORM_DEFAULT_CONNECTION_TYPE,
  isBuiltInPlatform,
  type ConnectionPlatform,
  type ConnectionStatus,
  type ConnectionType,
} from "@/models/platform-connection.model";
import type {
  CreatePlatformConnectionInput,
  UpdatePlatformConnectionInput,
  VerifyPlatformConnectionInput,
  ConnectViaPipedreamInput,
} from "@/validators/platform-connection.validator";

/** GET /api/platform-connections — all of the organization's connections. */
export const getMyPlatformConnections = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) throw new AppError("Authentication required", 401);

  const connections = await PlatformConnection.find({
    organization: organization._id,
  }).sort({ createdAt: 1 });

  sendSuccess(res, 200, "Platform connections retrieved", {
    connections: connections.map(toPublicPlatformConnection),
  });
});

/**
 * POST /api/platform-connections — connect a platform.
 *  - API-key provider: the credential is VERIFIED against the provider; the
 *    connection is stored (status "connected") only on success, else 422.
 *  - Custom/manual provider: stored as a manual connection.
 *  - OAuth provider: rejected (OAuth arrives in F9.2).
 */
export const createPlatformConnection = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  if (!user || !organization) throw new AppError("Authentication required", 401);

  const body = req.body as CreatePlatformConnectionInput;

  const exists = await PlatformConnection.exists({
    organization: organization._id,
    platform: body.platform,
  });
  if (exists) {
    throw new AppError(`${body.platform} is already connected.`, 409);
  }
  await assertPlatformConnectionLimit(organization._id, organization.planTier);

  const builtIn = isBuiltInPlatform(body.platform);
  const adapter = getAdapter(body.platform);
  const connectionType: ConnectionType =
    body.connectionType ??
    (builtIn
      ? PLATFORM_DEFAULT_CONNECTION_TYPE[body.platform as ConnectionPlatform]
      : "manual");

  let status: ConnectionStatus;
  let accountIdentifier = body.accountIdentifier;
  let lastVerifiedAt: Date | undefined;

  if (adapter?.authType === "api_key" && adapter.verify) {
    // Real verification — never a fake "connected".
    if (!body.credential) {
      throw new AppError("An API key is required to connect this provider.", 400);
    }
    const result = await adapter.verify(body.credential);
    if (!result.healthy) {
      throw new AppError(
        result.error ?? "The provider could not verify this API key.",
        422
      );
    }
    status = "connected";
    lastVerifiedAt = new Date();
    accountIdentifier = accountIdentifier ?? result.accountIdentifier;
  } else if (connectionType === "oauth") {
    throw new AppError(
      "This provider connects via OAuth, which isn't available yet.",
      400
    );
  } else {
    // Manual / custom provider — an honest manual connection (no fake auth).
    status = "connected";
  }

  const connection = await PlatformConnection.create({
    organization: organization._id,
    user: user._id,
    platform: body.platform,
    isCustom: !builtIn,
    connectionType,
    status,
    displayName: body.displayName ?? body.platform,
    ...(body.source ? { source: body.source } : {}),
    ...(accountIdentifier ? { accountIdentifier } : {}),
    ...(body.description ? { description: body.description } : {}),
    ...(body.website ? { website: body.website } : {}),
    ...(body.metadata ? { metadata: body.metadata } : {}),
    ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
    ...(body.credential
      ? {
          credential: encryptSecret(body.credential),
          credentialLast4: body.credential.slice(-4),
        }
      : {}),
  });

  sendSuccess(res, 201, "Platform connected", {
    connection: toPublicPlatformConnection(connection),
  });
});

/**
 * POST /api/platform-connections/:id/verify — verify / reconnect. With a new
 * credential it re-authenticates and re-stores it; without one it re-checks the
 * stored credential's health. The connection's real status is updated either way.
 */
export const verifyPlatformConnection = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) throw new AppError("Authentication required", 401);

  const id = req.params.id as string;
  const body = req.body as VerifyPlatformConnectionInput;

  const connection = await PlatformConnection.findOne({
    _id: id,
    organization: organization._id,
  }).select("+credential");
  if (!connection) throw new AppError("Platform connection not found", 404);

  // Pipedream-managed (OAuth) connections: re-check health via Pipedream (the
  // provider tokens live in Pipedream's vault; this app holds only a
  // reference) — using the ORIGINAL connecting user's id, never the org's.
  const meta = connection.metadata as { pipedreamAccountId?: string } | undefined;
  if (connection.connectionType === "oauth" && meta?.pipedreamAccountId) {
    const account = await getAccount(
      connection.user.toString(),
      meta.pipedreamAccountId
    );
    connection.status = account?.healthy ? "connected" : "error";
    connection.lastVerifiedAt = new Date();
    connection.lastError = account?.healthy
      ? undefined
      : "Account needs re-authentication.";
    if (account?.name) connection.accountIdentifier = account.name;
    await connection.save();
    sendSuccess(
      res,
      200,
      account?.healthy ? "Connection verified" : "Verification failed",
      { connection: toPublicPlatformConnection(connection) }
    );
    return;
  }

  const adapter = getAdapter(connection.platform);
  if (!adapter?.verify) {
    throw new AppError(
      "This connection cannot be verified automatically.",
      400
    );
  }

  const credential =
    body.credential ??
    (connection.credential ? decryptSecret(connection.credential) : undefined);
  if (!credential) {
    throw new AppError("No API key on file. Enter one to reconnect.", 400);
  }

  const result = await adapter.verify(credential);

  connection.status = result.healthy ? "connected" : "error";
  connection.lastVerifiedAt = new Date();
  connection.lastError = result.healthy
    ? undefined
    : result.error ?? "The provider could not verify this API key.";
  if (result.healthy && result.accountIdentifier) {
    connection.accountIdentifier = result.accountIdentifier;
  }
  if (body.credential) {
    connection.credential = encryptSecret(body.credential);
    connection.credentialLast4 = body.credential.slice(-4);
  }
  await connection.save();

  sendSuccess(
    res,
    200,
    result.healthy ? "Connection verified" : "Verification failed",
    { connection: toPublicPlatformConnection(connection) }
  );
});

/** GET /api/platform-connections/catalog?q= — live Pipedream app catalog. */
export const getPipedreamCatalog = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError("Authentication required", 401);
  if (!isPipedreamConfigured()) {
    // Honest, not faked: report unconfigured so the UI can hide the catalog.
    sendSuccess(res, 200, "Pipedream not configured", {
      configured: false,
      apps: [],
    });
    return;
  }
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const apps = await searchApps(q, Number.isFinite(limit) ? limit : undefined);
  sendSuccess(res, 200, "Catalog retrieved", { configured: true, apps });
});

/** POST /api/platform-connections/connect-token — mint a Pipedream Connect token
 *  for the current user so the browser can run the managed OAuth flow. Keyed
 *  by the connecting user's id (Pipedream's own external identity), not the
 *  organization's. */
export const createPipedreamConnectToken = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError("Authentication required", 401);
  const result = await createConnectToken(user._id.toString());
  // The Connect token is short-lived and scoped to this user; not a stored secret.
  sendSuccess(res, 201, "Connect token created", {
    token: result.token,
    expiresAt: result.expiresAt,
    connectLinkUrl: result.connectLinkUrl,
  });
});

/**
 * POST /api/platform-connections/pipedream — finalize a Pipedream connection.
 * After the browser completes the managed OAuth flow, Pipedream returns an
 * account id; we VERIFY it belongs to this user and store only the reference —
 * Pipedream vaults the actual tokens, so this app never holds raw credentials.
 * The resulting connection record is shared with the whole organization, but
 * stays keyed to the connecting user's Pipedream external identity.
 */
export const connectViaPipedream = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  if (!user || !organization) throw new AppError("Authentication required", 401);

  const body = req.body as ConnectViaPipedreamInput;
  const account = await getAccount(user._id.toString(), body.accountId);
  if (!account) {
    throw new AppError("That connected account could not be verified.", 404);
  }

  const platform = body.platform;

  // Only a genuinely NEW connection counts against the limit — reconnecting/
  // re-verifying an existing one (the upsert below) must never be blocked.
  const alreadyConnected = await PlatformConnection.exists({
    organization: organization._id,
    platform,
  });
  if (!alreadyConnected) {
    await assertPlatformConnectionLimit(organization._id, organization.planTier);
  }

  const set: Record<string, unknown> = {
    isCustom: false,
    connectionType: "oauth",
    status: account.healthy ? "connected" : "error",
    displayName: body.displayName ?? platform,
    lastVerifiedAt: new Date(),
    lastError: account.healthy ? undefined : "Account needs re-authentication.",
    metadata: { pipedreamAccountId: account.id, pipedreamApp: account.app },
  };
  if (account.name) set.accountIdentifier = account.name;

  const connection = await PlatformConnection.findOneAndUpdate(
    { organization: organization._id, platform },
    {
      $set: set,
      $setOnInsert: { organization: organization._id, user: user._id, platform },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  // Fire-and-forget: an immediate first pull for any platform with a billing-
  // sync adapter, so the user doesn't wait up to the recurring job's interval
  // to see their first data. A failure here never blocks the connect response.
  if (account.healthy) {
    void syncConnectionBilling(connection);
    if (isEmailSyncPlatform(platform)) {
      void syncConnectionEmail(connection);
    }
  }

  sendSuccess(res, 200, "Platform connected", {
    connection: toPublicPlatformConnection(connection),
  });
});

/** PATCH /api/platform-connections/:id — rename / update metadata only. */
export const updatePlatformConnection = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) throw new AppError("Authentication required", 401);

  const id = req.params.id as string;
  const body = req.body as UpdatePlatformConnectionInput;

  const update: Record<string, unknown> = {};
  if (body.displayName !== undefined) update.displayName = body.displayName;
  if (body.accountIdentifier !== undefined)
    update.accountIdentifier = body.accountIdentifier;
  if (body.metadata !== undefined) update.metadata = body.metadata;

  const connection = await PlatformConnection.findOneAndUpdate(
    { _id: id, organization: organization._id },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!connection) throw new AppError("Platform connection not found", 404);

  sendSuccess(res, 200, "Platform connection updated", {
    connection: toPublicPlatformConnection(connection),
  });
});

/** DELETE /api/platform-connections/:id — disconnect (remove the connection). */
export const deletePlatformConnection = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) throw new AppError("Authentication required", 401);

  const id = req.params.id as string;
  const deleted = await PlatformConnection.findOneAndDelete({
    _id: id,
    organization: organization._id,
  });
  if (!deleted) throw new AppError("Platform connection not found", 404);

  sendSuccess(res, 200, "Platform connection disconnected", {
    id: deleted._id.toString(),
  });
});
