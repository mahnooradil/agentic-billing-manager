import { describe, expect, it, vi } from "vitest";

import { legacyBillingVendorIdentity } from "@/services/vendors/legacy-billing-vendor-identity";

/**
 * Migration test (Task 7's own acceptance criterion) — verifies the exact
 * derivation `scripts/backfill-vendors.ts` uses to resolve a pre-Task-7
 * legacy record's vendor, for both sources, including its edge cases.
 */
describe("legacyBillingVendorIdentity", () => {
  it("email_sync: prefers vendorName + carries senderDomain when both are present", async () => {
    const identity = await legacyBillingVendorIdentity(
      {
        source: "email_sync",
        vendorName: "Netflix",
        customerName: "Acme Inc",
        senderDomain: "netflix.com",
      },
      vi.fn()
    );

    expect(identity).toEqual({ name: "Netflix", domain: "netflix.com" });
  });

  it("email_sync: falls back to customerName when vendorName is missing (pre-fix records)", async () => {
    const identity = await legacyBillingVendorIdentity(
      { source: "email_sync", vendorName: undefined, customerName: "Acme Inc" },
      vi.fn()
    );

    expect(identity).toEqual({ name: "Acme Inc", domain: undefined });
  });

  it("email_sync: omits domain when senderDomain was never captured (pre-Task-6 records)", async () => {
    const identity = await legacyBillingVendorIdentity(
      { source: "email_sync", vendorName: "Netflix", customerName: "Acme Inc" },
      vi.fn()
    );

    expect(identity).toEqual({ name: "Netflix", domain: undefined });
  });

  it("email_sync: returns null when there is truly no usable name", async () => {
    const identity = await legacyBillingVendorIdentity(
      { source: "email_sync", vendorName: "", customerName: "" },
      vi.fn()
    );

    expect(identity).toBeNull();
  });

  it("auto_sync: resolves via the injected connection-name lookup", async () => {
    const lookup = vi.fn().mockResolvedValue("AWS");
    const identity = await legacyBillingVendorIdentity(
      { source: "auto_sync", platformConnection: "conn-1", customerName: "AWS" },
      lookup
    );

    expect(identity).toEqual({ name: "AWS" });
    expect(lookup).toHaveBeenCalledWith("conn-1");
  });

  it("auto_sync: returns null when there is no connection reference at all", async () => {
    const lookup = vi.fn();
    const identity = await legacyBillingVendorIdentity(
      { source: "auto_sync", platformConnection: null, customerName: "AWS" },
      lookup
    );

    expect(identity).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("auto_sync: returns null when the connection no longer resolves to a name", async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    const identity = await legacyBillingVendorIdentity(
      { source: "auto_sync", platformConnection: "conn-deleted", customerName: "AWS" },
      lookup
    );

    expect(identity).toBeNull();
  });
});
