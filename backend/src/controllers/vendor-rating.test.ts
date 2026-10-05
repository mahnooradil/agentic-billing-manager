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

/** flow/extra-02 Part A1 — periodic self-reported usage rating, the
 *  cheapest honest usage signal ("which subscriptions aren't being used
 *  enough?") that exists without any new integration or AI call. */
describe("Vendor usage rating — GET /vendors/due-for-rating, POST /:id/rate (real HTTP)", () => {
  async function seedUser() {
    const organization = await Organization.create({ name: "Vendor Rating Test Org" });
    const user = await User.create({
      fullName: "Vendor Rating Test User",
      email: `vendor-rating-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    return { organization, user, token };
  }

  it("an unconfirmed vendor never shows up as due for rating — confirm comes first", async () => {
    const { organization, token } = await seedUser();
    await Vendor.create({
      organization: organization._id,
      name: "Still Pending Co",
      dedupeKey: "name:still pending co",
    });

    const res = await request(app)
      .get("/api/vendors/due-for-rating")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vendors).toHaveLength(0);
  });

  it("a confirmed, never-rated vendor shows up due for rating, with a sample billing record", async () => {
    const { organization, user, token } = await seedUser();
    const vendor = await Vendor.create({
      organization: organization._id,
      name: "Confirmed Tool",
      dedupeKey: "name:confirmed tool",
      confirmedAt: new Date(),
    });
    await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: new Types.ObjectId(),
      vendor: vendor._id,
      source: "email_sync",
      customerName: "My Org",
      invoiceNumber: "INV-RATE-1",
      amount: 29.99,
      currency: "USD",
      billingDate: new Date("2026-01-15"),
      status: "Paid",
    });

    const res = await request(app)
      .get("/api/vendors/due-for-rating")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vendors).toHaveLength(1);
    expect(res.body.data.vendors[0].name).toBe("Confirmed Tool");
    expect(res.body.data.vendors[0].sampleBilling).toEqual(
      expect.objectContaining({ amount: 29.99, currency: "USD" })
    );
  });

  it("rating a vendor sets utilityRating + utilityRatedAt and removes it from the due list", async () => {
    const { organization, token } = await seedUser();
    const vendor = await Vendor.create({
      organization: organization._id,
      name: "Rate Me Inc",
      dedupeKey: "name:rate me inc",
      confirmedAt: new Date(),
    });

    const rateRes = await request(app)
      .post(`/api/vendors/${vendor._id.toString()}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ utilityRating: "rarely" });
    expect(rateRes.status).toBe(200);
    expect(rateRes.body.data.vendor.utilityRating).toBe("rarely");
    expect(rateRes.body.data.vendor.utilityRatedAt).toBeTruthy();

    const dueRes = await request(app)
      .get("/api/vendors/due-for-rating")
      .set("Authorization", `Bearer ${token}`);
    expect(dueRes.body.data.vendors).toHaveLength(0);
  });

  it("rejects an invalid utilityRating value (zod)", async () => {
    const { organization, token } = await seedUser();
    const vendor = await Vendor.create({
      organization: organization._id,
      name: "Bad Input Co",
      dedupeKey: "name:bad input co",
      confirmedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/vendors/${vendor._id.toString()}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ utilityRating: "constantly" });
    expect(res.status).toBe(400);
  });

  it("a vendor rated long ago (past the 60-day staleness window) is due again", async () => {
    const { organization, token } = await seedUser();
    const staleDate = new Date(Date.now() - 90 * 86_400_000);
    await Vendor.create({
      organization: organization._id,
      name: "Long Ago Rated Co",
      dedupeKey: "name:long ago rated co",
      confirmedAt: new Date(),
      utilityRating: "daily",
      utilityRatedAt: staleDate,
    });

    const res = await request(app)
      .get("/api/vendors/due-for-rating")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.data.vendors).toHaveLength(1);
    expect(res.body.data.vendors[0].name).toBe("Long Ago Rated Co");
  });

  it("a recently-rated vendor (within the 60-day window) is NOT due again", async () => {
    const { organization, token } = await seedUser();
    const recentDate = new Date(Date.now() - 10 * 86_400_000);
    await Vendor.create({
      organization: organization._id,
      name: "Recently Rated Co",
      dedupeKey: "name:recently rated co",
      confirmedAt: new Date(),
      utilityRating: "daily",
      utilityRatedAt: recentDate,
    });

    const res = await request(app)
      .get("/api/vendors/due-for-rating")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.data.vendors).toHaveLength(0);
  });

  it("a rejected vendor never shows up due for rating", async () => {
    const { organization, token } = await seedUser();
    await Vendor.create({
      organization: organization._id,
      name: "Rejected Co",
      dedupeKey: "name:rejected co",
      confirmedAt: new Date(),
      rejectedAt: new Date(),
    });

    const res = await request(app)
      .get("/api/vendors/due-for-rating")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.data.vendors).toHaveLength(0);
  });

  it("scopes strictly by organization — another org's due-for-rating vendor never leaks", async () => {
    const { token } = await seedUser();
    const otherOrg = await Organization.create({ name: "Other Rating Org" });
    await Vendor.create({
      organization: otherOrg._id,
      name: "Someone Else's Confirmed Vendor",
      dedupeKey: "name:someone else's confirmed vendor",
      confirmedAt: new Date(),
    });

    const res = await request(app)
      .get("/api/vendors/due-for-rating")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.data.vendors).toHaveLength(0);
  });

  it("404s rating a vendor that belongs to a different organization", async () => {
    const { token } = await seedUser();
    const otherOrg = await Organization.create({ name: "Other Org For 404" });
    const otherVendor = await Vendor.create({
      organization: otherOrg._id,
      name: "Not Yours",
      dedupeKey: "name:not yours",
      confirmedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/vendors/${otherVendor._id.toString()}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ utilityRating: "daily" });
    expect(res.status).toBe(404);
  });
});
