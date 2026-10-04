import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { Billing } from "@/models/billing.model";
import { tryRouteDeterministically } from "@/services/ai/intent-router.service";

/**
 * WP-7 intent router (flow/04 §8). The most important property to prove
 * isn't just "a clear match works" — it's that anything NOT a confident,
 * unambiguous match falls through to `null` (the real agent), since a wrong
 * deterministic financial answer is a worse failure than spending credits.
 */
describe("tryRouteDeterministically", () => {
  async function seedBilling(organizationId: Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) {
    return Billing.create({
      organization: organizationId,
      user: new Types.ObjectId(),
      platform: new Types.ObjectId(),
      source: "manual",
      customerName: "Acme",
      invoiceNumber: `INV-${new Types.ObjectId().toString()}`,
      amount: 10,
      currency: "USD",
      billingDate: new Date(),
      status: "Pending",
      ...overrides,
    });
  }

  describe("aggregate", () => {
    it("'how much did I spend' sums all-time, across every record", async () => {
      const org = new Types.ObjectId();
      await seedBilling(org, { amount: 100, status: "Paid" });
      await seedBilling(org, {
        amount: 50,
        status: "Paid",
        billingDate: new Date(Date.now() - 1000 * 86_400_000), // ~3 years ago
      });

      const result = await tryRouteDeterministically(org.toString(), "How much did I spend?");
      expect(result?.intent).toBe("aggregate");
      expect(result?.reply).toContain("150.00");
      expect(result?.reply).toContain("all time");
    });

    it("'how much did I spend this month' excludes a record from 2 months ago", async () => {
      const org = new Types.ObjectId();
      await seedBilling(org, { amount: 75, status: "Paid", billingDate: new Date() });
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      await seedBilling(org, { amount: 999, status: "Paid", billingDate: twoMonthsAgo });

      const result = await tryRouteDeterministically(org.toString(), "how much did I spend this month?");
      expect(result?.reply).toContain("75.00");
      expect(result?.reply).not.toContain("999.00");
      expect(result?.reply).toContain("this month");
    });

    it("reports zero records honestly instead of guessing", async () => {
      const org = new Types.ObjectId();
      const result = await tryRouteDeterministically(org.toString(), "what's my total spend?");
      expect(result?.reply).toMatch(/no billing records/i);
    });
  });

  describe("lookup", () => {
    it("'show me invoices from Netflix' finds a matching vendor record", async () => {
      const org = new Types.ObjectId();
      await seedBilling(org, {
        source: "email_sync",
        platform: undefined,
        platformConnection: new Types.ObjectId(),
        vendorName: "Netflix",
        invoiceNumber: "NF-1",
        amount: 15.99,
      });
      await seedBilling(org, { invoiceNumber: "OTHER-1", customerName: "Spotify Co" });

      const result = await tryRouteDeterministically(org.toString(), "show me invoices from Netflix");
      expect(result?.intent).toBe("lookup");
      expect(result?.reply).toContain("NF-1");
      expect(result?.reply).not.toContain("OTHER-1");
    });

    it("reports zero matches honestly", async () => {
      const org = new Types.ObjectId();
      const result = await tryRouteDeterministically(org.toString(), "find invoices from Nonexistent Vendor");
      expect(result?.reply).toMatch(/no invoices found/i);
    });
  });

  describe("explain", () => {
    it("explains a derived-status record by its exact invoice number", async () => {
      const org = new Types.ObjectId();
      await seedBilling(org, {
        invoiceNumber: "INV-EXPLAIN-1",
        status: "Paid",
        derivedStatus: "paid",
        derivedStatusExplanation: "A payment confirmation was observed and nothing later overrides it.",
      });

      const result = await tryRouteDeterministically(
        org.toString(),
        "why is invoice INV-EXPLAIN-1 marked paid?"
      );
      expect(result?.intent).toBe("explain");
      expect(result?.reply).toContain("INV-EXPLAIN-1");
      expect(result?.reply).toContain("payment confirmation was observed");
    });

    it("flags a manually-edited record as human-set, not synced", async () => {
      const org = new Types.ObjectId();
      await seedBilling(org, {
        invoiceNumber: "INV-MANUAL-1",
        status: "Paid",
        manuallyEditedAt: new Date(),
      });

      const result = await tryRouteDeterministically(org.toString(), "why is invoice INV-MANUAL-1 overdue?");
      expect(result?.reply).toMatch(/set manually/i);
    });

    it("reports an unknown invoice number honestly, not a guess", async () => {
      const org = new Types.ObjectId();
      const result = await tryRouteDeterministically(org.toString(), "explain invoice DOES-NOT-EXIST");
      expect(result?.reply).toMatch(/couldn't find/i);
    });
  });

  describe("falls through to the real agent (returns null) for anything not a confident match", () => {
    const ambiguousMessages = [
      "Can you help me understand my invoices?",
      "What should I do about my overdue bills?",
      "Hey, how are you?",
      "Tell me about my spending patterns and give advice",
      "Connect my Stripe account",
      "Mark invoice INV-1 as paid", // action — deliberately not deterministic yet
      "Notify me when a new invoice comes in", // rule — deliberately not deterministic yet
    ];

    for (const message of ambiguousMessages) {
      it(`"${message}"`, async () => {
        const org = new Types.ObjectId();
        const result = await tryRouteDeterministically(org.toString(), message);
        expect(result).toBeNull();
      });
    }
  });
});
