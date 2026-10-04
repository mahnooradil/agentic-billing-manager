import { describe, expect, it } from "vitest";

import {
  deriveStatus,
  mapDerivedStatusToBillingStatus,
  DERIVED_STATUSES,
  type BillingEventLike,
} from "@/services/billing/status-machine";

const DAY_MS = 86_400_000;
const day = (offset: number): Date => new Date(2026, 0, 1 + offset);

function event(partial: Partial<BillingEventLike> & Pick<BillingEventLike, "type" | "occurredAt">): BillingEventLike {
  return { confidence: 0.9, source: "email_sync", ...partial };
}

describe("deriveStatus", () => {
  it("GM-024: invoice -> reminder -> receipt collapses to one obligation, final status paid", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0) }),
      event({ type: "reminder", occurredAt: day(3) }),
      event({ type: "payment_confirmed", occurredAt: day(5) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("paid");
    expect(result.basis).toBe("ai");
  });

  it("GM-025/GM-026: a receipt processed out of order (older invoice arrives in a LATER run than its own payment confirmation) still ends up paid", () => {
    // The receipt is recorded first (run N), the original invoice email is
    // only processed in run N+1 — occurredAt still reflects each email's
    // own real date, so sorting by occurredAt (not insertion order) is what
    // makes this resolve correctly regardless of which run wrote it first.
    const events: BillingEventLike[] = [
      event({ type: "payment_confirmed", occurredAt: day(5) }),
      event({ type: "invoice_issued", occurredAt: day(0) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("paid");
  });

  it("GM-027: a stale reminder arriving after a payment confirmation does NOT flip status back to pending", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0) }),
      event({ type: "payment_confirmed", occurredAt: day(5) }),
      // The stale reminder's own occurredAt is EARLIER than the payment
      // confirmation (it was actually sent before the payment) but only
      // got processed/synced afterward — occurredAt-based sorting still
      // places it before the payment in the chronology, and the payment
      // being absorbing against reminders is what protects the outcome
      // either way.
      event({ type: "reminder", occurredAt: day(2) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("paid");
  });

  it("a reminder arriving chronologically AFTER a payment confirmation also does not reopen it", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0) }),
      event({ type: "payment_confirmed", occurredAt: day(5) }),
      event({ type: "reminder", occurredAt: day(9) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("paid");
  });

  it("payment_failed after payment_confirmed reopens to payment_processing", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0) }),
      event({ type: "payment_confirmed", occurredAt: day(3) }),
      event({ type: "payment_failed", occurredAt: day(5) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("payment_processing");
  });

  it("a terminal refund event blocks a later reminder from reopening it", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0) }),
      event({ type: "payment_confirmed", occurredAt: day(2) }),
      event({ type: "refunded", occurredAt: day(4) }),
      event({ type: "reminder", occurredAt: day(6) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("refunded");
  });

  it("a terminal cancelled event also absorbs a later payment_confirmed (documented interpretation)", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0) }),
      event({ type: "cancelled", occurredAt: day(2) }),
      event({ type: "payment_confirmed", occurredAt: day(4) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("cancelled");
  });

  it("a credit_note event maps onto cancelled", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0) }),
      event({ type: "credit_note", occurredAt: day(2) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("cancelled");
  });

  it("no payment event: overdue when the due date has passed", () => {
    const events: BillingEventLike[] = [event({ type: "invoice_issued", occurredAt: day(0) })];
    const now = day(10);
    const result = deriveStatus(events, day(5), now);
    expect(result.status).toBe("overdue");
  });

  it("no payment event: due_soon within 7 days of the due date", () => {
    const events: BillingEventLike[] = [event({ type: "invoice_issued", occurredAt: day(0) })];
    const now = day(0);
    const result = deriveStatus(events, new Date(now.getTime() + 3 * DAY_MS), now);
    expect(result.status).toBe("due_soon");
  });

  it("no payment event: pending when the due date is well in the future", () => {
    const events: BillingEventLike[] = [event({ type: "invoice_issued", occurredAt: day(0) })];
    const now = day(0);
    const result = deriveStatus(events, new Date(now.getTime() + 30 * DAY_MS), now);
    expect(result.status).toBe("pending");
  });

  it("no events and no due date: pending", () => {
    const result = deriveStatus([], null);
    expect(result.status).toBe("pending");
    expect(result.basis).toBe("rule");
  });

  it("duplicate events (the exact same observation recorded twice) are idempotent", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0) }),
      event({ type: "payment_confirmed", occurredAt: day(3) }),
      event({ type: "payment_confirmed", occurredAt: day(3) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("paid");
  });

  it("conflicting amount_changed events apply a confidence penalty per extra conflict", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0), confidence: 0.9 }),
      event({ type: "amount_changed", occurredAt: day(1) }),
      event({ type: "amount_changed", occurredAt: day(2) }),
      event({ type: "amount_changed", occurredAt: day(3) }),
      event({ type: "payment_confirmed", occurredAt: day(5), confidence: 0.9 }),
    ];
    const result = deriveStatus(events, day(10));
    // 3 amount_changed events = 2 "extra" beyond the first = 0.4 penalty.
    expect(result.confidence).toBeCloseTo(0.9 - 0.4, 5);
  });

  it("a manual user_correction always wins, even over a later payment_confirmed", () => {
    const events: BillingEventLike[] = [
      event({ type: "invoice_issued", occurredAt: day(0) }),
      event({
        type: "user_correction",
        occurredAt: day(2),
        confidence: 1,
        source: "user",
        correctedStatus: "Overdue",
      }),
      event({ type: "payment_confirmed", occurredAt: day(5) }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("overdue");
    expect(result.basis).toBe("user");
    expect(result.confidence).toBe(1);
  });

  it("the MOST RECENT user_correction wins when there is more than one", () => {
    const events: BillingEventLike[] = [
      event({
        type: "user_correction",
        occurredAt: day(1),
        confidence: 1,
        source: "user",
        correctedStatus: "Paid",
      }),
      event({
        type: "user_correction",
        occurredAt: day(4),
        confidence: 1,
        source: "user",
        correctedStatus: "Pending",
      }),
    ];
    const result = deriveStatus(events, day(10));
    expect(result.status).toBe("pending");
  });
});

describe("mapDerivedStatusToBillingStatus", () => {
  it("maps the reachable-today states exactly as the narrow cutover intends", () => {
    expect(mapDerivedStatusToBillingStatus("paid")).toBe("Paid");
    expect(mapDerivedStatusToBillingStatus("overdue")).toBe("Overdue");
    expect(mapDerivedStatusToBillingStatus("pending")).toBe("Pending");
    expect(mapDerivedStatusToBillingStatus("due_soon")).toBe("Pending");
    // A failed payment after a prior confirmation reads as a problem state,
    // not quietly "Pending" — matches what the old naive write would have
    // called it (the AI extractor only ever reports "Overdue" for this).
    expect(mapDerivedStatusToBillingStatus("payment_processing")).toBe("Overdue");
  });

  it("is exhaustive over every DerivedStatus value — no value silently falls through", () => {
    for (const value of DERIVED_STATUSES) {
      expect(["Pending", "Paid", "Overdue"]).toContain(mapDerivedStatusToBillingStatus(value));
    }
  });

  it("maps the currently-unreachable states conservatively (refund keeps its historical Paid, cancelled/disputed stay visible as Pending)", () => {
    expect(mapDerivedStatusToBillingStatus("refunded")).toBe("Paid");
    expect(mapDerivedStatusToBillingStatus("partially_refunded")).toBe("Paid");
    expect(mapDerivedStatusToBillingStatus("partially_paid")).toBe("Paid");
    expect(mapDerivedStatusToBillingStatus("cancelled")).toBe("Pending");
    expect(mapDerivedStatusToBillingStatus("disputed")).toBe("Pending");
    expect(mapDerivedStatusToBillingStatus("issued")).toBe("Pending");
  });
});
