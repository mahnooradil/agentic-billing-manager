import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { PlatformConnection } from "@/models/platform-connection.model";

/**
 * Verifies the exact database-level guarantees behind the S-17 fix: the
 * success and error update patterns both sync-engine.ts files now use
 * (identical shape in both), applied directly against the model.
 */
describe("PlatformConnection sync observability (S-17)", () => {
  async function createTestConnection() {
    return PlatformConnection.create({
      organization: new Types.ObjectId(),
      user: new Types.ObjectId(),
      platform: "gmail",
      accountIdentifier: "observability-test@gmail.com",
      displayName: "Observability Test",
      status: "connected",
      connectionType: "oauth",
    });
  }

  it("a successful sync records lastSyncAt/Status/counts and clears any prior error", async () => {
    const connection = await createTestConnection();

    // Simulate a prior failed run first, so clearing it is actually tested.
    await PlatformConnection.updateOne(
      { _id: connection._id },
      { $set: { lastSyncStatus: "error", lastSyncError: "previous failure" } }
    );

    await PlatformConnection.updateOne(
      { _id: connection._id },
      {
        $set: { lastSyncAt: new Date(), lastSyncStatus: "success", messagesScanned: 12, invoicesFound: 3 },
        $unset: { lastSyncError: "" },
      }
    );

    const reloaded = await PlatformConnection.findById(connection._id);
    expect(reloaded?.lastSyncStatus).toBe("success");
    expect(reloaded?.messagesScanned).toBe(12);
    expect(reloaded?.invoicesFound).toBe(3);
    expect(reloaded?.lastSyncError).toBeUndefined();
    expect(reloaded?.lastSyncAt).toBeInstanceOf(Date);
  });

  it("a failed sync records a safe lastSyncError and lastSyncStatus: error", async () => {
    const connection = await createTestConnection();

    await PlatformConnection.updateOne(
      { _id: connection._id },
      {
        $set: {
          lastSyncAt: new Date(),
          lastSyncStatus: "error",
          lastSyncError: "The last sync attempt failed. It will retry automatically.",
        },
      }
    );

    const reloaded = await PlatformConnection.findById(connection._id);
    expect(reloaded?.lastSyncStatus).toBe("error");
    expect(reloaded?.lastSyncError).toMatch(/failed/i);
  });

  it("rejects an invalid lastSyncStatus value", async () => {
    const connection = await createTestConnection();

    await expect(
      PlatformConnection.updateOne(
        { _id: connection._id },
        { $set: { lastSyncStatus: "partial" } },
        { runValidators: true }
      )
    ).rejects.toThrow();
  });
});
