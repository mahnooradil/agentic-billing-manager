import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";
import { Vendor } from "@/models/vendor.model";
import { Billing } from "@/models/billing.model";

const app = createApp();

/** WP-5's onboarding "confirm detected vendors" step (flow/08 §9). */
describe("Vendor confirmation — GET /vendors/pending, confirm, reject (real HTTP)", () => {
  async function seedUser() {
    const organization = await Organization.create({ name: "Vendor Confirm Test Org" });
    const user = await User.create({
      fullName: "Vendor Confirm Test User",
      email: `vendor-confirm-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    return { organization, user, token };
  }

  it("a brand-new vendor shows up as pending, with a sample billing record", async () => {
    const { organization, user, token } = await seedUser();
    const vendor = await Vendor.create({
      organization: organization._id,
      name: "Acme Cloud",
      domain: "acme.test",
      dedupeKey: "acme.test",
    });
    await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: new Types.ObjectId(),
      vendor: vendor._id,
      source: "email_sync",
      customerName: "My Org",
      invoiceNumber: "INV-1",
      amount: 12.5,
      currency: "USD",
      billingDate: new Date("2026-01-01"),
      status: "Paid",
    });

    const res = await request(app).get("/api/vendors/pending").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vendors).toHaveLength(1);
    expect(res.body.data.vendors[0].name).toBe("Acme Cloud");
    expect(res.body.data.vendors[0].sampleBilling).toEqual(
      expect.objectContaining({ amount: 12.5, currency: "USD" })
    );
  });

  it("confirming a vendor removes it from the pending list", async () => {
    const { organization, token } = await seedUser();
    const vendor = await Vendor.create({
      organization: organization._id,
      name: "Beta Inc",
      dedupeKey: "name:beta inc",
    });

    const confirmRes = await request(app)
      .post(`/api/vendors/${vendor._id.toString()}/confirm`)
      .set("Authorization", `Bearer ${token}`);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.vendor.confirmedAt).toBeTruthy();

    const pendingRes = await request(app).get("/api/vendors/pending").set("Authorization", `Bearer ${token}`);
    expect(pendingRes.body.data.vendors).toHaveLength(0);
  });

  it("rejecting a vendor removes it from the pending list and does NOT touch its Billing records", async () => {
    const { organization, user, token } = await seedUser();
    const vendor = await Vendor.create({
      organization: organization._id,
      name: "Not Really A Vendor",
      dedupeKey: "name:not really a vendor",
    });
    const billing = await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: new Types.ObjectId(),
      vendor: vendor._id,
      source: "email_sync",
      customerName: "My Org",
      invoiceNumber: "INV-2",
      amount: 5,
      currency: "USD",
      billingDate: new Date("2026-02-01"),
      status: "Paid",
    });

    const rejectRes = await request(app)
      .post(`/api/vendors/${vendor._id.toString()}/reject`)
      .set("Authorization", `Bearer ${token}`);
    expect(rejectRes.status).toBe(200);

    const pendingRes = await request(app).get("/api/vendors/pending").set("Authorization", `Bearer ${token}`);
    expect(pendingRes.body.data.vendors).toHaveLength(0);

    const reloadedBilling = await Billing.findById(billing._id);
    expect(reloadedBilling).not.toBeNull();
    expect(reloadedBilling?.vendor?.toString()).toBe(vendor._id.toString());
  });

  it("scopes strictly by organization — another org's pending vendor never leaks", async () => {
    const { token } = await seedUser();
    const otherOrg = await Organization.create({ name: "Other Org" });
    await Vendor.create({
      organization: otherOrg._id,
      name: "Someone Else's Vendor",
      dedupeKey: "name:someone else's vendor",
    });

    const res = await request(app).get("/api/vendors/pending").set("Authorization", `Bearer ${token}`);
    expect(res.body.data.vendors).toHaveLength(0);
  });
});
