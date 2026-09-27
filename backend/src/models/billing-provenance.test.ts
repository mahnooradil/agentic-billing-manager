import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { Billing } from "@/models/billing.model";

/**
 * Verifies the provenance trail added to Billing (Task 6): the fields an
 * email_sync record now carries so a user or the agent can trace "where did
 * this actually come from" back to a real email, instead of taking a single
 * AI extraction on faith.
 */
describe("Billing provenance fields", () => {
  function baseFields() {
    return {
      organization: new Types.ObjectId(),
      user: new Types.ObjectId(),
      platformConnection: new Types.ObjectId(),
      source: "email_sync" as const,
      externalId: `gmail-inv-netflix-${Date.now()}`,
      vendorName: "Netflix",
      customerName: "Acme Inc",
      invoiceNumber: "INV-001",
      amount: 15.99,
      currency: "USD",
      billingDate: new Date(),
      status: "Paid" as const,
    };
  }

  it("stores a full provenance trail on an email_sync record", async () => {
    const receivedAt = new Date("2026-09-01T10:00:00Z");
    const extractedAt = new Date();

    const record = await Billing.create({
      ...baseFields(),
      sourceMessageId: "18f2a9c3b1d0e5f6",
      sourceThreadId: "18f2a9c3b1d0e5f0",
      senderEmail: "billing@netflix.com",
      senderDomain: "netflix.com",
      receivedAt,
      subject: "Your Netflix receipt",
      extractionConfidence: 0.92,
      extractionModel: "claude-haiku-4-5-20251001",
      extractedAt,
      evidence: ["Thanks for being a Netflix member. Your payment of $15.99 was received."],
    });

    const reloaded = await Billing.findById(record._id);
    expect(reloaded?.sourceMessageId).toBe("18f2a9c3b1d0e5f6");
    expect(reloaded?.sourceThreadId).toBe("18f2a9c3b1d0e5f0");
    expect(reloaded?.senderEmail).toBe("billing@netflix.com");
    expect(reloaded?.senderDomain).toBe("netflix.com");
    expect(reloaded?.receivedAt?.getTime()).toBe(receivedAt.getTime());
    expect(reloaded?.subject).toBe("Your Netflix receipt");
    expect(reloaded?.extractionConfidence).toBe(0.92);
    expect(reloaded?.extractionModel).toBe("claude-haiku-4-5-20251001");
    expect(reloaded?.extractedAt).toBeInstanceOf(Date);
    expect(reloaded?.evidence).toHaveLength(1);
    expect(reloaded?.evidence?.[0]).toMatch(/Netflix member/);
  });

  it("a manual/auto_sync record works exactly as before with no provenance fields (backward compatible)", async () => {
    const record = await Billing.create({
      organization: new Types.ObjectId(),
      user: new Types.ObjectId(),
      platform: new Types.ObjectId(),
      source: "manual",
      customerName: "Acme Inc",
      invoiceNumber: "INV-002",
      amount: 100,
      currency: "USD",
      billingDate: new Date(),
    });

    const reloaded = await Billing.findById(record._id);
    expect(reloaded?.sourceMessageId).toBeUndefined();
    expect(reloaded?.senderEmail).toBeUndefined();
    expect(reloaded?.extractionConfidence).toBeUndefined();
    expect(reloaded?.evidence).toBeUndefined();
  });

  it("rejects an extractionConfidence outside 0-1", async () => {
    await expect(
      Billing.create({
        ...baseFields(),
        extractionConfidence: 1.5,
      })
    ).rejects.toThrow();

    await expect(
      Billing.create({
        ...baseFields(),
        externalId: `gmail-inv-netflix-${Date.now()}-2`,
        extractionConfidence: -0.1,
      })
    ).rejects.toThrow();
  });

  it("rejects an evidence snippet longer than 300 characters", async () => {
    await expect(
      Billing.create({
        ...baseFields(),
        evidence: ["x".repeat(301)],
      })
    ).rejects.toThrow();
  });
});
