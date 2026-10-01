import { describe, expect, it } from "vitest";

import { listBillingSyncAdapters } from "@/services/billing-sync/registry";

/**
 * WP-4's domain-model census, as a standing guard rather than a one-time
 * fact: the audit found exactly 124 of 129 adapters hardcode
 * `status: "Pending"` forever (classified `kind: "usage_accrual"`) and 5
 * genuinely derive a status (`kind: "invoice"`). This test fails loudly if
 * a future adapter is added without a `kind`, or if the known 5
 * invoice-kind adapters' classification ever drifts — both real mistakes
 * this census would otherwise silently miss.
 */
describe("billing-sync adapter kind census (WP-4)", () => {
  const EXPECTED_INVOICE_ADAPTERS = [
    "gocardless",
    "heroku",
    "mongodb",
    "northflank",
    "snapchat_marketing",
  ];

  it("every registered adapter declares a kind", () => {
    const adapters = listBillingSyncAdapters();
    expect(adapters.length).toBeGreaterThan(0);
    for (const adapter of adapters) {
      expect(["invoice", "usage_accrual"]).toContain(adapter.kind);
    }
  });

  it("exactly the 5 audit-confirmed adapters are classified as real invoices", () => {
    const adapters = listBillingSyncAdapters();
    const invoiceAdapters = adapters
      .filter((a) => a.kind === "invoice")
      .map((a) => a.platform)
      .sort();

    expect(invoiceAdapters).toEqual([...EXPECTED_INVOICE_ADAPTERS].sort());
  });

  it("every other adapter is classified as usage_accrual", () => {
    const adapters = listBillingSyncAdapters();
    const usageAdapters = adapters.filter((a) => a.kind === "usage_accrual");
    expect(usageAdapters.length).toBe(adapters.length - EXPECTED_INVOICE_ADAPTERS.length);
  });
});
