import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { ProcessedMessage } from "@/models/processed-message.model";

describe("ProcessedMessage", () => {
  it("rejects a duplicate (connection, messageId) via the unique index", async () => {
    const connection = new Types.ObjectId();
    const messageId = "msg-001";
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 180 * 86_400_000);

    await ProcessedMessage.create({
      connection,
      messageId,
      outcome: "not_billing",
      processedAt: now,
      expiresAt,
    });

    await expect(
      ProcessedMessage.create({
        connection,
        messageId,
        outcome: "invoice",
        processedAt: now,
        expiresAt,
      })
    ).rejects.toThrow();

    const count = await ProcessedMessage.countDocuments({ connection, messageId });
    expect(count).toBe(1);
  });

  it("allows the same messageId across two DIFFERENT connections", async () => {
    const messageId = "shared-message-id";
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 180 * 86_400_000);

    await ProcessedMessage.create({
      connection: new Types.ObjectId(),
      messageId,
      outcome: "invoice",
      processedAt: now,
      expiresAt,
    });
    await ProcessedMessage.create({
      connection: new Types.ObjectId(),
      messageId,
      outcome: "invoice",
      processedAt: now,
      expiresAt,
    });

    const count = await ProcessedMessage.countDocuments({ messageId });
    expect(count).toBe(2);
  });

  it("an upsert on the same key updates the outcome in place, never duplicates", async () => {
    const connection = new Types.ObjectId();
    const messageId = "msg-upsert";
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 180 * 86_400_000);

    await ProcessedMessage.updateOne(
      { connection, messageId },
      { $set: { outcome: "not_billing", processedAt: now, expiresAt } },
      { upsert: true }
    );
    await ProcessedMessage.updateOne(
      { connection, messageId },
      { $set: { outcome: "invoice", processedAt: now, expiresAt } },
      { upsert: true }
    );

    const docs = await ProcessedMessage.find({ connection, messageId });
    expect(docs).toHaveLength(1);
    expect(docs[0]?.outcome).toBe("invoice");
  });

  it("rejects an outcome value outside invoice|not_billing", async () => {
    await expect(
      ProcessedMessage.create({
        connection: new Types.ObjectId(),
        messageId: "msg-bad-outcome",
        // @ts-expect-error — deliberately invalid, this is what the test verifies
        outcome: "error",
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 180 * 86_400_000),
      })
    ).rejects.toThrow();
  });
});
