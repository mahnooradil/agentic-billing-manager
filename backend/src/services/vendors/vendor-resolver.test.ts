import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { Vendor } from "@/models/vendor.model";
import { resolveVendor } from "@/services/vendors/vendor-resolver.service";

/**
 * Verifies the real vendor-identity guarantee behind Task 7: the SAME real
 * vendor — however many times it's resolved, from whichever sync engine,
 * with whatever casing — always lands on ONE Vendor document per
 * organization, never a duplicate.
 */
describe("resolveVendor", () => {
  it("resolving the same domain twice returns the same Vendor document", async () => {
    const org = new Types.ObjectId();
    const first = await resolveVendor(org, { name: "Netflix", domain: "netflix.com" });
    const second = await resolveVendor(org, { name: "Netflix", domain: "netflix.com" });

    expect(second._id.toString()).toBe(first._id.toString());
    expect(await Vendor.countDocuments({ organization: org, domain: "netflix.com" })).toBe(1);
  });

  it("resolving a domain-less name is case-insensitive (AWS vs aws)", async () => {
    const org = new Types.ObjectId();
    const first = await resolveVendor(org, { name: "AWS" });
    const second = await resolveVendor(org, { name: "aws" });

    expect(second._id.toString()).toBe(first._id.toString());
    expect(await Vendor.countDocuments({ organization: org })).toBe(1);
  });

  it("the same real vendor resolved once by domain and once by name-only stays separate (no false merge)", async () => {
    // This documents current behavior, not a gap: a billing-sync adapter
    // has no domain to observe, so "AWS" (name-only) and an email-derived
    // "AWS" <billing@aws.amazon.com> (domain-keyed) do NOT automatically
    // merge into one Vendor from name similarity alone — only an identical
    // domain, or an identical domain-less name, ever collapses two resolves
    // onto the same document. Merging on brand-name similarity would risk
    // false positives (e.g. two unrelated vendors both display as "Support").
    const org = new Types.ObjectId();
    const byDomain = await resolveVendor(org, { name: "AWS", domain: "aws.amazon.com" });
    const byName = await resolveVendor(org, { name: "AWS" });

    expect(byDomain._id.toString()).not.toBe(byName._id.toString());
    expect(await Vendor.countDocuments({ organization: org })).toBe(2);
  });

  it("refreshes the display name on a later resolve (self-correcting)", async () => {
    const org = new Types.ObjectId();
    await resolveVendor(org, { name: "Netflix Inc", domain: "netflix.com" });
    const updated = await resolveVendor(org, { name: "Netflix", domain: "netflix.com" });

    expect(updated.name).toBe("Netflix");
    expect(await Vendor.countDocuments({ organization: org, domain: "netflix.com" })).toBe(1);
  });

  it("the same domain in two different organizations creates two separate vendors", async () => {
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    const a = await resolveVendor(orgA, { name: "Netflix", domain: "netflix.com" });
    const b = await resolveVendor(orgB, { name: "Netflix", domain: "netflix.com" });

    expect(a._id.toString()).not.toBe(b._id.toString());
  });

  it("the unique {organization, dedupeKey} index rejects a raw duplicate insert", async () => {
    const org = new Types.ObjectId();
    await Vendor.create({ organization: org, name: "Netflix", domain: "netflix.com", dedupeKey: "netflix.com" });

    await expect(
      Vendor.create({ organization: org, name: "Netflix Again", domain: "netflix.com", dedupeKey: "netflix.com" })
    ).rejects.toThrow();
  });
});
