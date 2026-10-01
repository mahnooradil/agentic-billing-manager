import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";
import { Platform } from "@/models/platform.model";
import { Billing } from "@/models/billing.model";

const app = createApp();

/**
 * WP-3 (CLAUDE.md Sec10.3) — two real bugs via the actual HTTP routes, not
 * just the underlying functions: (1) `GET /api/billing/stats` used to sum
 * Paid amounts across every currency as one bare number; (2) `GET
 * /api/billing` ran with no `.limit()` at all.
 */
describe("GET /api/billing/stats and /api/billing — WP-3", () => {
  async function seedAuthedUser() {
    const organization = await Organization.create({ name: "Test Org" });
    const user = await User.create({
      fullName: "Test User",
      email: `user-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    const platform = await Platform.create({
      organization: organization._id,
      user: user._id,
      name: "Test Platform",
      slug: `test-platform-${new Types.ObjectId().toString()}`,
    });
    return { organization, user, token, platform };
  }

  it("never adds Paid amounts across different currencies into one number", async () => {
    const { organization, user, token, platform } = await seedAuthedUser();

    await Billing.create([
      {
        organization: organization._id,
        user: user._id,
        platform: platform._id,
        customerName: "Acme",
        invoiceNumber: "USD-1",
        amount: 100,
        currency: "USD",
        billingDate: new Date(),
        status: "Paid",
      },
      {
        organization: organization._id,
        user: user._id,
        platform: platform._id,
        customerName: "Acme",
        invoiceNumber: "USD-2",
        amount: 50,
        currency: "USD",
        billingDate: new Date(),
        status: "Paid",
      },
      {
        organization: organization._id,
        user: user._id,
        platform: platform._id,
        customerName: "Acme EU",
        invoiceNumber: "EUR-1",
        amount: 30,
        currency: "EUR",
        billingDate: new Date(),
        status: "Paid",
      },
      {
        organization: organization._id,
        user: user._id,
        platform: platform._id,
        customerName: "Acme",
        invoiceNumber: "USD-3",
        amount: 999,
        currency: "USD",
        billingDate: new Date(),
        status: "Pending", // excluded — only Paid counts toward revenue
      },
    ]);

    const response = await request(app)
      .get("/api/billing/stats")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.stats.totalRevenue).toBeUndefined();
    const byCurrency: { currency: string; total: number }[] =
      response.body.data.stats.revenueByCurrency;
    expect(byCurrency).toHaveLength(2);
    // Sorted highest-first — USD (150) before EUR (30), never summed together.
    expect(byCurrency[0]).toEqual({ currency: "USD", total: 150 });
    expect(byCurrency[1]).toEqual({ currency: "EUR", total: 30 });
  });

  it("GET /api/billing is paginated, not an unbounded find()", async () => {
    const { organization, user, token, platform } = await seedAuthedUser();

    const docs = Array.from({ length: 5 }, (_, i) => ({
      organization: organization._id,
      user: user._id,
      platform: platform._id,
      customerName: "Acme",
      invoiceNumber: `PAGE-${i}`,
      amount: 10,
      currency: "USD",
      billingDate: new Date(Date.now() - i * 86_400_000),
      status: "Pending" as const,
    }));
    await Billing.create(docs);

    const response = await request(app)
      .get("/api/billing?limit=2&page=1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.billingRecords).toHaveLength(2);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 2,
      totalRecords: 5,
      totalPages: 3,
    });

    const secondPage = await request(app)
      .get("/api/billing?limit=2&page=2")
      .set("Authorization", `Bearer ${token}`);
    expect(secondPage.body.data.billingRecords).toHaveLength(2);

    // A limit above the hard ceiling is rejected, not silently truncated to
    // the ceiling nor allowed through — fails loudly via the validator.
    const tooLarge = await request(app)
      .get("/api/billing?limit=999999")
      .set("Authorization", `Bearer ${token}`);
    expect(tooLarge.status).toBe(400);
  });

  it("GET /api/billing with no query params still returns every current record (default limit is a no-op today)", async () => {
    const { organization, user, token, platform } = await seedAuthedUser();
    await Billing.create(
      Array.from({ length: 3 }, (_, i) => ({
        organization: organization._id,
        user: user._id,
        platform: platform._id,
        customerName: "Acme",
        invoiceNumber: `DEFAULT-${i}`,
        amount: 10,
        currency: "USD",
        billingDate: new Date(),
        status: "Pending" as const,
      }))
    );

    const response = await request(app)
      .get("/api/billing")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.billingRecords).toHaveLength(3);
    expect(response.body.data.pagination.totalRecords).toBe(3);
  });
});
