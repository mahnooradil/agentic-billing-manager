/**
 * Zod schemas for platform connection requests.
 *  - create: `platform` is required; everything else is an optional placeholder.
 *  - update (PATCH): rename / metadata only — platform, status and connectionType
 *    are intentionally NOT updatable here (future phases own status transitions).
 */
import { z } from "zod";

import {
  CONNECTION_TYPES,
  CONNECTION_STATUSES,
  CONNECTION_SOURCES,
} from "@/models/platform-connection.model";

/** Free-form, PII-free metadata object (bounded loosely). */
const metadataSchema = z.record(z.string(), z.unknown());

/** Optional website: empty string or a valid URL. */
const optionalUrl = z.union([z.literal(""), z.string().trim().url().max(300)]);

export const createPlatformConnectionSchema = z.object({
  // A built-in key (e.g. "Stripe") or a custom platform name.
  platform: z.string().trim().min(2).max(60),
  connectionType: z.enum(CONNECTION_TYPES).optional(),
  status: z.enum(CONNECTION_STATUSES).optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  accountIdentifier: z.string().trim().max(200).optional(),
  description: z.string().trim().max(300).optional(),
  website: optionalUrl.optional(),
  metadata: metadataSchema.optional(),
  // Encrypted placeholder only — never a raw OAuth token.
  credential: z.string().trim().min(8).max(500).optional(),
  // How the connection was initiated (manual UI vs the AI assistant). Additive.
  source: z.enum(CONNECTION_SOURCES).optional(),
});

export const updatePlatformConnectionSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    accountIdentifier: z.string().trim().max(200),
    metadata: metadataSchema,
  })
  .partial();

/** Verify / reconnect: an optional new credential (else the stored one is used). */
export const verifyPlatformConnectionSchema = z.object({
  credential: z.string().trim().min(8).max(500).optional(),
});

/** Finalize a Pipedream-managed connection (after the browser OAuth flow). */
export const connectViaPipedreamSchema = z.object({
  platform: z.string().trim().min(2).max(60),
  displayName: z.string().trim().min(1).max(100).optional(),
  accountId: z.string().trim().min(1).max(200),
});

export type CreatePlatformConnectionInput = z.infer<
  typeof createPlatformConnectionSchema
>;
export type UpdatePlatformConnectionInput = z.infer<
  typeof updatePlatformConnectionSchema
>;
export type VerifyPlatformConnectionInput = z.infer<
  typeof verifyPlatformConnectionSchema
>;
export type ConnectViaPipedreamInput = z.infer<
  typeof connectViaPipedreamSchema
>;
