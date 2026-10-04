import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";

const app = createApp();

/**
 * WP-12 (flow/03 Sec7: "no full data export (CSV-only)"). Real HTTP route —
 * seeds a platform + billing record via the real API first, then confirms
 * the export bundle actually contains them, not just that the endpoint
 * returns 200 with an empty shape.
 */
describe("GET /api/organization/export (WP-12)", () => {
  async function seedAuthedUser() {
    const organization = await Organization.create({ name: "Export Test Org" });
    const user = await User.create({
      fullName: "Export Test User",
      email: `export-test-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    return { organization, user, token };
  }

  it("bundles the organization's real data as a downloadable JSON file", async () => {
    const { organization, token } = await seedAuthedUser();

    const platformRes = await request(app)
      .post("/api/platforms")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Export Test Platform", slug: "export-test-platform" });
    const platformId = platformRes.body.data.platform.id as string;

    await request(app)
      .post("/api/billing")
      .set("Authorization", `Bearer ${token}`)
      .send({
        platform: platformId,
        customerName: "Acme",
        invoiceNumber: "EXPORT-1",
        amount: 40,
        currency: "USD",
        billingDate: new Date().toISOString(),
      });

    const response = await request(app)
      .get("/api/organization/export")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).toContain(".json");

    const payload = JSON.parse(response.text);
    expect(payload.organization.id).toBe(organization._id.toString());
    expect(payload.platforms).toHaveLength(1);
    expect(payload.platforms[0].name).toBe("Export Test Platform");
    expect(payload.billingRecords).toHaveLength(1);
    expect(payload.billingRecords[0].invoiceNumber).toBe("EXPORT-1");
    // The create itself produced one AuditLog entry (WP-12's own audit-log
    // feature) — confirms the export bundle includes it, not just billing.
    expect(payload.auditLog).toHaveLength(1);
    expect(payload.auditLog[0].action).toBe("create");
    // toPublicUserSettings never returns null — a user with no stored
    // settings document yet gets the real defaults back, with a null id.
    expect(payload.userSettings).not.toBeNull();
    expect(payload.userSettings.id).toBeNull();
    expect(payload.userSettings.general).toBeDefined();
  });

  it("a member (not just owner/admin) can export — this is a read, not a mutation", async () => {
    const organization = await Organization.create({ name: "Export Member Org" });
    const user = await User.create({
      fullName: "Export Member",
      email: `export-member-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "member" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });

    const response = await request(app)
      .get("/api/organization/export")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});
