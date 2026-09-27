import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { PlatformConnection } from "@/models/platform-connection.model";

/**
 * Verifies the exact database-level guarantee behind the S-11 fix in
 * `platform-connection.controller.ts`'s `connectViaPipedream`: the dotted
 * `$set` paths it now uses for `metadata.pipedreamAccountId`/
 * `metadata.pipedreamApp` must never disturb any OTHER key already living
 * under `metadata` — specifically `metadata.emailSync.lastSyncedAt`, the
 * email-sync watermark a routine reconnect used to silently wipe.
 */
describe("PlatformConnection reconnect — metadata watermark preservation (S-11)", () => {
  it("a dotted-path $set on pipedreamAccountId/pipedreamApp preserves metadata.emailSync", async () => {
    const connection = await PlatformConnection.create({
      organization: new Types.ObjectId(),
      user: new Types.ObjectId(),
      platform: "gmail",
      accountIdentifier: "reconnect-test@gmail.com",
      displayName: "Reconnect Test",
      status: "connected",
      connectionType: "oauth",
      metadata: {
        pipedreamAccountId: "old-account-id",
        pipedreamApp: "gmail",
        emailSync: { lastSyncedAt: "2026-09-01T00:00:00.000Z" },
      },
    });

    // The exact shape connectViaPipedream now builds — dotted paths only.
    await PlatformConnection.findOneAndUpdate(
      { _id: connection._id },
      {
        $set: {
          status: "connected",
          "metadata.pipedreamAccountId": "new-account-id-after-reconnect",
          "metadata.pipedreamApp": "gmail",
        },
      }
    );

    const reloaded = await PlatformConnection.findById(connection._id);
    expect(reloaded?.metadata).toMatchObject({
      pipedreamAccountId: "new-account-id-after-reconnect",
      pipedreamApp: "gmail",
      emailSync: { lastSyncedAt: "2026-09-01T00:00:00.000Z" },
    });
  });

  it("regression guard: a PLAIN metadata replacement (the old bug) DOES wipe emailSync — proving the two approaches genuinely differ", async () => {
    const connection = await PlatformConnection.create({
      organization: new Types.ObjectId(),
      user: new Types.ObjectId(),
      platform: "gmail",
      accountIdentifier: "regression-test@gmail.com",
      displayName: "Regression Test",
      status: "connected",
      connectionType: "oauth",
      metadata: {
        pipedreamAccountId: "old-account-id",
        pipedreamApp: "gmail",
        emailSync: { lastSyncedAt: "2026-09-01T00:00:00.000Z" },
      },
    });

    // The OLD buggy shape — a plain object replaces the whole subdocument.
    await PlatformConnection.findOneAndUpdate(
      { _id: connection._id },
      { $set: { metadata: { pipedreamAccountId: "new-id", pipedreamApp: "gmail" } } }
    );

    const reloaded = await PlatformConnection.findById(connection._id);
    expect(reloaded?.metadata?.emailSync).toBeUndefined();
  });
});
