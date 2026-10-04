import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { Billing } from "@/models/billing.model";
import { findDuplicateCandidateGroups } from "@/services/billing/billing-duplicate-detector.service";

/**
 * WP-5's "duplicate flags" (flow/08 §6). The critical thing to prove isn't
 * just "two identical rows are flagged" — it's that a normal RECURRING
 * charge (the same vendor/amount next month) is never mistaken for one.
 */
describe("findDuplicateCandidateGroups", () => {
  async function createBilling(overrides: Partial<Record<string, unknown>> = {}) {
    return Billing.create({
      organization: new Types.ObjectId(),
      user: new Types.ObjectId(),
      platform: new Types.ObjectId(),
      source: "manual",
      customerName: "Acme",
      invoiceNumber: `INV-${new Types.ObjectId().toString()}`,
      amount: 29.99,
      currency: "USD",
      billingDate: new Date("2026-01-01"),
      status: "Paid",
      ...overrides,
    });
  }

  it("flags two records for the same vendor/amount/currency a few days apart", async () => {
    const organization = new Types.ObjectId();
    const vendorId = new Types.ObjectId();
    await createBilling({ organization, vendor: vendorId, billingDate: new Date("2026-03-01") });
    await createBilling({ organization, vendor: vendorId, billingDate: new Date("2026-03-03") });

    const groups = await findDuplicateCandidateGroups(organization);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("does NOT flag the same vendor/amount a month apart — normal recurring billing", async () => {
    const organization = new Types.ObjectId();
    const vendorId = new Types.ObjectId();
    await createBilling({ organization, vendor: vendorId, billingDate: new Date("2026-01-05") });
    await createBilling({ organization, vendor: vendorId, billingDate: new Date("2026-02-05") });
    await createBilling({ organization, vendor: vendorId, billingDate: new Date("2026-03-05") });

    const groups = await findDuplicateCandidateGroups(organization);
    expect(groups).toHaveLength(0);
  });

  it("groups by vendorName when no resolved Vendor id exists (older email_sync records)", async () => {
    const organization = new Types.ObjectId();
    await createBilling({
      organization,
      source: "email_sync",
      platform: undefined,
      platformConnection: new Types.ObjectId(),
      vendorName: "Netflix",
      billingDate: new Date("2026-05-01"),
    });
    await createBilling({
      organization,
      source: "email_sync",
      platform: undefined,
      platformConnection: new Types.ObjectId(),
      vendorName: "netflix", // same vendor, different casing
      billingDate: new Date("2026-05-02"),
    });

    const groups = await findDuplicateCandidateGroups(organization);
    expect(groups).toHaveLength(1);
  });

  it("excludes a record already merged (duplicateOf set)", async () => {
    const organization = new Types.ObjectId();
    const vendorId = new Types.ObjectId();
    const canonical = await createBilling({ organization, vendor: vendorId, billingDate: new Date("2026-04-01") });
    await createBilling({
      organization,
      vendor: vendorId,
      billingDate: new Date("2026-04-02"),
      duplicateOf: canonical._id,
    });

    const groups = await findDuplicateCandidateGroups(organization);
    expect(groups).toHaveLength(0);
  });

  it("excludes a record the user already dismissed as not-a-duplicate", async () => {
    const organization = new Types.ObjectId();
    const vendorId = new Types.ObjectId();
    await createBilling({ organization, vendor: vendorId, billingDate: new Date("2026-06-01") });
    await createBilling({
      organization,
      vendor: vendorId,
      billingDate: new Date("2026-06-02"),
      duplicateDismissedAt: new Date(),
    });

    const groups = await findDuplicateCandidateGroups(organization);
    expect(groups).toHaveLength(0);
  });

  it("a different amount is never grouped, even for the same vendor on the same day", async () => {
    const organization = new Types.ObjectId();
    const vendorId = new Types.ObjectId();
    await createBilling({ organization, vendor: vendorId, amount: 10, billingDate: new Date("2026-07-01") });
    await createBilling({ organization, vendor: vendorId, amount: 25, billingDate: new Date("2026-07-01") });

    const groups = await findDuplicateCandidateGroups(organization);
    expect(groups).toHaveLength(0);
  });

  it("scopes strictly by organization — never cross-tenant", async () => {
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    const vendorId = new Types.ObjectId();
    await createBilling({ organization: orgA, vendor: vendorId, billingDate: new Date("2026-08-01") });
    await createBilling({ organization: orgB, vendor: vendorId, billingDate: new Date("2026-08-02") });

    expect(await findDuplicateCandidateGroups(orgA)).toHaveLength(0);
    expect(await findDuplicateCandidateGroups(orgB)).toHaveLength(0);
  });
});
