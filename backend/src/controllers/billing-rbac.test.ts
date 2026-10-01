import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership, type MembershipRole } from "@/models/membership.model";
import { Platform } from "@/models/platform.model";
import { Billing } from "@/models/billing.model";

const app = createApp();

/**
 * flow/02 item 18 (CLAUDE.md Sec10.6 S-13) — `billing.controller.ts` had
 * zero role checks: any `member` (not just owner/admin) could create, edit,
 * or delete any financial record in the organization. Real HTTP routes, not
 * just the underlying functions.
 */
describe("Billing mutations are owner/admin only (RBAC)", () => {
  async function seedUserWithRole(role: MembershipRole) {
    const organization = await Organization.create({ name: "Test Org" });
    const user = await User.create({
      fullName: "Test User",
      email: `user-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    const platform = await Platform.create({
      organization: organization._id,
      user: user._id,
      name: "Test Platform",
      slug: `test-platform-${new Types.ObjectId().toString()}`,
    });
    return { organization, user, token, platform };
  }

  it("a member cannot create a billing record (403)", async () => {
    const { token, platform } = await seedUserWithRole("member");

    const response = await request(app)
      .post("/api/billing")
      .set("Authorization", `Bearer ${token}`)
      .send({
        platform: platform._id.toString(),
        customerName: "Acme",
        invoiceNumber: "INV-1",
        amount: 10,
        currency: "USD",
        billingDate: new Date().toISOString(),
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/owner or admin/i);
  });

  it("an admin CAN create a billing record (not just owner)", async () => {
    const { token, platform } = await seedUserWithRole("admin");

    const response = await request(app)
      .post("/api/billing")
      .set("Authorization", `Bearer ${token}`)
      .send({
        platform: platform._id.toString(),
        customerName: "Acme",
        invoiceNumber: "INV-2",
        amount: 10,
        currency: "USD",
        billingDate: new Date().toISOString(),
      });

    expect(response.status).toBe(201);
  });

  it("a member cannot update or delete a billing record (403), but CAN still read it", async () => {
    const { organization, user, token, platform } = await seedUserWithRole("member");
    const billing = await Billing.create({
      organization: organization._id,
      user: user._id,
      platform: platform._id,
      customerName: "Acme",
      invoiceNumber: "INV-3",
      amount: 10,
      currency: "USD",
      billingDate: new Date(),
    });

    const updateRes = await request(app)
      .put(`/api/billing/${billing._id.toString()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "trying to edit as a member" });
    expect(updateRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/billing/${billing._id.toString()}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(403);

    // Reads stay open to every member — this is an edit/delete restriction,
    // not a visibility restriction.
    const listRes = await request(app)
      .get("/api/billing")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.billingRecords).toHaveLength(1);

    const getRes = await request(app)
      .get(`/api/billing/${billing._id.toString()}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(200);

    const reloaded = await Billing.findById(billing._id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.notes).toBeUndefined();
  });

  it("a member cannot bulk-import billing records (403)", async () => {
    const { token, platform } = await seedUserWithRole("member");
    const csv = `platform,customer,invoice number,amount,currency,billing date\n${platform.name},Acme,INV-IMPORT,10,USD,2026-01-01`;

    const response = await request(app)
      .post("/api/billing/import")
      .set("Authorization", `Bearer ${token}`)
      .send({ csv });

    expect(response.status).toBe(403);
  });
});
