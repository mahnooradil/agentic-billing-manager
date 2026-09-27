import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { Billing } from "@/models/billing.model";
import { BillingEvent } from "@/models/billing-event.model";
import { recordBillingEvent, recomputeDerivedStatus } from "@/services/billing/billing-event-recorder.service";

describe("recordBillingEvent / recomputeDerivedStatus (real DB)", () => {
  async function createBilling(overrides: Partial<Record<string, unknown>> = {}) {
    return Billing.create({
      organization: new Types.ObjectId(),
      user: new Types.ObjectId(),
      platformConnection: new Types.ObjectId(),
      source: "email_sync",
      externalId: `gmail-inv-test-${Date.now()}-${Math.random()}`,
      customerName: "Test Org",
      vendorName: "Netflix",
      invoiceNumber: "NF-001",
      amount: 15.99,
      currency: "USD",
      billingDate: new Date(),
      status: "Pending",
      ...overrides,
    });
  }

  it("appends a real BillingEvent row and stores the derived status on the Billing document", async () => {
    const billing = await createBilling();

    await recordBillingEvent({
      organization: billing.organization,
      billing: billing._id,
      type: "invoice_issued",
      occurredAt: new Date("2026-01-01"),
      confidence: 0.9,
      source: "email_sync",
    });
    await recordBillingEvent({
      organization: billing.organization,
      billing: billing._id,
      type: "payment_confirmed",
      occurredAt: new Date("2026-01-05"),
      confidence: 0.95,
      source: "email_sync",
    });

    const events = await BillingEvent.find({ billing: billing._id });
    expect(events).toHaveLength(2);

    const reloaded = await Billing.findById(billing._id);
    expect(reloaded?.derivedStatus).toBe("paid");
    expect(reloaded?.derivedStatusBasis).toBe("ai");
    expect(reloaded?.derivedStatusConfidence).toBeCloseTo(0.95, 5);
    expect(reloaded?.derivedStatusUpdatedAt).toBeInstanceOf(Date);
    // The real `status` field is completely untouched by any of this —
    // dual-write, never a replacement.
    expect(reloaded?.status).toBe("Pending");
  });

  it("GM-027 end-to-end: a stale reminder recorded AFTER a payment confirmation does not revert the stored derivedStatus", async () => {
    const billing = await createBilling();

    await recordBillingEvent({
      organization: billing.organization,
      billing: billing._id,
      type: "invoice_issued",
      occurredAt: new Date("2026-01-01"),
      confidence: 0.9,
      source: "email_sync",
    });
    await recordBillingEvent({
      organization: billing.organization,
      billing: billing._id,
      type: "payment_confirmed",
      occurredAt: new Date("2026-01-05"),
      confidence: 0.9,
      source: "email_sync",
    });

    let reloaded = await Billing.findById(billing._id);
    expect(reloaded?.derivedStatus).toBe("paid");

    // A later sync run re-processes an older, stale reminder email.
    await recordBillingEvent({
      organization: billing.organization,
      billing: billing._id,
      type: "reminder",
      occurredAt: new Date("2026-01-03"),
      confidence: 0.9,
      source: "email_sync",
    });

    reloaded = await Billing.findById(billing._id);
    expect(reloaded?.derivedStatus).toBe("paid");
  });

  it("a user_correction event always wins and is itself recorded as an event", async () => {
    const billing = await createBilling();

    await recordBillingEvent({
      organization: billing.organization,
      billing: billing._id,
      type: "payment_confirmed",
      occurredAt: new Date("2026-01-05"),
      confidence: 0.9,
      source: "email_sync",
    });
    await recordBillingEvent({
      organization: billing.organization,
      billing: billing._id,
      type: "user_correction",
      occurredAt: new Date(),
      confidence: 1,
      source: "user",
      correctedStatus: "Overdue",
      createdBy: new Types.ObjectId(),
    });

    const events = await BillingEvent.find({ billing: billing._id, type: "user_correction" });
    expect(events).toHaveLength(1);
    expect(events[0]?.correctedStatus).toBe("Overdue");

    const reloaded = await Billing.findById(billing._id);
    expect(reloaded?.derivedStatus).toBe("overdue");
    expect(reloaded?.derivedStatusBasis).toBe("user");
  });

  it("recomputeDerivedStatus with no events falls back to the due-date rule", async () => {
    const past = new Date(Date.now() - 5 * 86_400_000);
    const billing = await createBilling({ dueDate: past });

    await recomputeDerivedStatus(billing._id);

    const reloaded = await Billing.findById(billing._id);
    expect(reloaded?.derivedStatus).toBe("overdue");
    expect(reloaded?.derivedStatusBasis).toBe("rule");
  });
});
