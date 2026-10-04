import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership, type MembershipRole } from "@/models/membership.model";
import { Platform } from "@/models/platform.model";

const app = createApp();

/**
 * WP-12 (flow/03 item: "no audit log on financial mutations"). Real HTTP
 * routes, not the recorder function directly — proves billing.controller.ts
 * actually calls it, not just that the service function works in isolation.
 */
describe("Audit log (WP-12)", () => {
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

  it("records a create/update/delete trail, in order, readable via GET /api/audit-log", async () => {
    const { token, platform } = await seedUserWithRole("owner");

    const createRes = await request(app)
      .post("/api/billing")
      .set("Authorization", `Bearer ${token}`)
      .send({
        platform: platform._id.toString(),
        customerName: "Acme",
        invoiceNumber: "AUDIT-1",
        amount: 25,
        currency: "USD",
        billingDate: new Date().toISOString(),
      });
    expect(createRes.status).toBe(201);
    const billingId = createRes.body.data.billingRecord.id as string;

    await request(app)
      .put(`/api/billing/${billingId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Paid" });

    await request(app)
      .delete(`/api/billing/${billingId}`)
      .set("Authorization", `Bearer ${token}`);

    const logRes = await request(app)
      .get("/api/audit-log")
      .set("Authorization", `Bearer ${token}`);

    expect(logRes.status).toBe(200);
    const entries = logRes.body.data.entries as {
      action: string;
      summary: string;
      entityId: string;
      user: { fullName: string } | null;
    }[];
    expect(entries).toHaveLength(3);
    // Newest first.
    expect(entries[0].action).toBe("delete");
    expect(entries[0].summary).toContain("Deleted invoice AUDIT-1");
    expect(entries[1].action).toBe("update");
    expect(entries[1].summary).toContain("Pending to Paid");
    expect(entries[2].action).toBe("create");
    expect(entries[2].summary).toContain("Created invoice AUDIT-1");
    // The deleted record's log entry still names the right (now-gone) entity.
    expect(entries[0].entityId).toBe(billingId);
    expect(entries[0].user?.fullName).toBe("Test User");
  });

  it("a member cannot view the audit log (403)", async () => {
    const { token } = await seedUserWithRole("member");
    const response = await request(app)
      .get("/api/audit-log")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
  });
});
