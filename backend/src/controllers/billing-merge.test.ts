import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership, type MembershipRole } from "@/models/membership.model";
import { Billing } from "@/models/billing.model";
import { AuditLog } from "@/models/audit-log.model";
import { Platform } from "@/models/platform.model";

const app = createApp();

/**
 * WP-5's "duplicate flags with a merge action" (flow/08 §6). The user's own
 * explicit choice when asked was non-destructive: merging must never delete
 * anything, only hide + link, and must be fully reversible.
 */
describe("Billing duplicate-candidates / merge / unmerge / dismiss (real HTTP)", () => {
  async function seedUserWithRole(role: MembershipRole) {
    const organization = await Organization.create({ name: "Merge Test Org" });
    const user = await User.create({
      fullName: "Merge Test User",
      email: `merge-test-${new Types.ObjectId().toString()}@example.com`,
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

  async function createBilling(
    organizationId: Types.ObjectId,
    userId: Types.ObjectId,
    platformId: Types.ObjectId,
    overrides: Partial<Record<string, unknown>> = {}
  ) {
    const vendorId = (overrides.vendor as Types.ObjectId) ?? new Types.ObjectId();
    return Billing.create({
      organization: organizationId,
      user: userId,
      platform: platformId,
      vendor: vendorId,
      source: "manual",
      customerName: "Acme",
      invoiceNumber: `INV-${new Types.ObjectId().toString()}`,
      amount: 42,
      currency: "USD",
      billingDate: new Date("2026-05-01"),
      status: "Paid",
      ...overrides,
    });
  }

  it("GET /billing/duplicate-candidates returns a flagged pair", async () => {
    const { organization, user, token, platform } = await seedUserWithRole("owner");
    const vendorId = new Types.ObjectId();
    await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-05-01") });
    await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-05-02") });

    const res = await request(app)
      .get("/api/billing/duplicate-candidates")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0]).toHaveLength(2);
  });

  it("merge hides the duplicate from the list and stats, without deleting it", async () => {
    const { organization, user, token, platform } = await seedUserWithRole("owner");
    const vendorId = new Types.ObjectId();
    const canonical = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-06-01"), amount: 50 });
    const duplicate = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-06-02"), amount: 50 });

    const mergeRes = await request(app)
      .post(`/api/billing/${canonical._id.toString()}/merge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ duplicateId: duplicate._id.toString() });
    expect(mergeRes.status).toBe(200);

    // Nothing deleted — the document still exists, exactly where it was.
    const reloaded = await Billing.findById(duplicate._id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.duplicateOf?.toString()).toBe(canonical._id.toString());

    // Hidden from the default list.
    const listRes = await request(app).get("/api/billing").set("Authorization", `Bearer ${token}`);
    expect(listRes.body.data.billingRecords).toHaveLength(1);
    expect(listRes.body.data.billingRecords[0].id).toBe(canonical._id.toString());

    // But still reachable with includeDuplicates=true.
    const listAllRes = await request(app)
      .get("/api/billing?includeDuplicates=true")
      .set("Authorization", `Bearer ${token}`);
    expect(listAllRes.body.data.billingRecords).toHaveLength(2);

    // Stats only count the canonical record once, not twice.
    const statsRes = await request(app).get("/api/billing/stats").set("Authorization", `Bearer ${token}`);
    expect(statsRes.body.data.stats.totalRecords).toBe(1);
    expect(statsRes.body.data.stats.revenueByCurrency).toEqual([{ currency: "USD", total: 50 }]);

    // An audit trail entry was recorded.
    const audit = await AuditLog.find({ organization: organization._id, entityId: duplicate._id });
    expect(audit).toHaveLength(1);
    expect(audit[0].summary).toMatch(/merged/i);
  });

  it("unmerge fully reverses a merge", async () => {
    const { organization, user, token, platform } = await seedUserWithRole("owner");
    const vendorId = new Types.ObjectId();
    const canonical = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-07-01") });
    const duplicate = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-07-02") });

    await request(app)
      .post(`/api/billing/${canonical._id.toString()}/merge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ duplicateId: duplicate._id.toString() });

    const unmergeRes = await request(app)
      .post(`/api/billing/${duplicate._id.toString()}/unmerge`)
      .set("Authorization", `Bearer ${token}`);
    expect(unmergeRes.status).toBe(200);

    const listRes = await request(app).get("/api/billing").set("Authorization", `Bearer ${token}`);
    expect(listRes.body.data.billingRecords).toHaveLength(2);
  });

  it("dismiss-duplicate excludes a record from future candidate detection, without touching anyone else's role access", async () => {
    const { organization, user, token, platform } = await seedUserWithRole("member");
    const vendorId = new Types.ObjectId();
    const a = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-08-01") });
    await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-08-02") });

    // A member (not owner/admin) can still dismiss — no financial data changes.
    const dismissRes = await request(app)
      .post(`/api/billing/${a._id.toString()}/dismiss-duplicate`)
      .set("Authorization", `Bearer ${token}`);
    expect(dismissRes.status).toBe(200);

    const candidatesRes = await request(app)
      .get("/api/billing/duplicate-candidates")
      .set("Authorization", `Bearer ${token}`);
    expect(candidatesRes.body.data.groups).toHaveLength(0);
  });

  it("a member cannot merge or unmerge (403) — financial-data mutation stays owner/admin only", async () => {
    const { organization, user, token, platform } = await seedUserWithRole("member");
    const vendorId = new Types.ObjectId();
    const canonical = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-09-01") });
    const duplicate = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-09-02") });

    const mergeRes = await request(app)
      .post(`/api/billing/${canonical._id.toString()}/merge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ duplicateId: duplicate._id.toString() });
    expect(mergeRes.status).toBe(403);

    const unmergeRes = await request(app)
      .post(`/api/billing/${canonical._id.toString()}/unmerge`)
      .set("Authorization", `Bearer ${token}`);
    expect(unmergeRes.status).toBe(403);
  });

  it("merging a record already merged elsewhere is rejected (400)", async () => {
    const { organization, user, token, platform } = await seedUserWithRole("owner");
    const vendorId = new Types.ObjectId();
    const first = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-10-01") });
    const duplicate = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-10-02") });
    const second = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-10-03") });

    await request(app)
      .post(`/api/billing/${first._id.toString()}/merge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ duplicateId: duplicate._id.toString() });

    const res = await request(app)
      .post(`/api/billing/${second._id.toString()}/merge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ duplicateId: duplicate._id.toString() });
    expect(res.status).toBe(400);
  });

  it("deleting a canonical record un-hides anything that had been merged into it", async () => {
    const { organization, user, token, platform } = await seedUserWithRole("owner");
    const vendorId = new Types.ObjectId();
    const canonical = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-11-01") });
    const duplicate = await createBilling(organization._id, user._id, platform._id, { vendor: vendorId, billingDate: new Date("2026-11-02") });

    await request(app)
      .post(`/api/billing/${canonical._id.toString()}/merge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ duplicateId: duplicate._id.toString() });

    await request(app)
      .delete(`/api/billing/${canonical._id.toString()}`)
      .set("Authorization", `Bearer ${token}`);

    const reloaded = await Billing.findById(duplicate._id);
    expect(reloaded?.duplicateOf).toBeUndefined();

    const listRes = await request(app).get("/api/billing").set("Authorization", `Bearer ${token}`);
    expect(listRes.body.data.billingRecords).toHaveLength(1);
    expect(listRes.body.data.billingRecords[0].id).toBe(duplicate._id.toString());
  });
});
