import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";
import { Platform } from "@/models/platform.model";
import { Billing } from "@/models/billing.model";
import { BillingEvent } from "@/models/billing-event.model";
import { Vendor } from "@/models/vendor.model";
import { Invitation } from "@/models/invitation.model";
import { UserSettings } from "@/models/user-settings.model";

const app = createApp();

/**
 * WP-12 hardening (flow/03 item 25) — deleteAccount now runs its whole
 * cascade inside one MongoDB transaction instead of an unordered
 * `Promise.all`, and the cascade's own collection list was completed
 * (BillingEvent/UsageAccrual/Vendor/Invitation/Subscription were silently
 * orphaned before). Tests go through the real `DELETE /api/auth/account`
 * route, not the function directly.
 */
describe("DELETE /api/auth/account (WP-12)", () => {
  async function seedFullAccount() {
    const organization = await Organization.create({ name: "Delete Test Org" });
    const user = await User.create({
      fullName: "Delete Test User",
      email: `delete-test-${new Types.ObjectId().toString()}@example.com`,
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
    const billing = await Billing.create({
      organization: organization._id,
      user: user._id,
      platform: platform._id,
      customerName: "Acme",
      invoiceNumber: "INV-1",
      amount: 10,
      currency: "USD",
      billingDate: new Date(),
    });
    await BillingEvent.create({
      organization: organization._id,
      billing: billing._id,
      type: "invoice_issued",
      occurredAt: new Date(),
      confidence: 0.9,
      source: "email_sync",
    });
    await Vendor.create({
      organization: organization._id,
      name: "Acme Vendor",
      dedupeKey: "acme-vendor",
    });
    await Invitation.create({
      organization: organization._id,
      email: "invitee@example.com",
      role: "member",
      token: `tok-${new Types.ObjectId().toString()}`,
      invitedBy: user._id,
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await UserSettings.create({ user: user._id });

    return { organization, user, token, platform, billing };
  }

  it("deletes the user and every piece of org/user-scoped data, including the previously-orphaned collections", async () => {
    const { organization, user, token } = await seedFullAccount();

    const response = await request(app)
      .delete("/api/auth/account")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(await User.findById(user._id)).toBeNull();
    expect(await Organization.findById(organization._id)).toBeNull();
    expect(await Membership.countDocuments({ user: user._id })).toBe(0);
    expect(await Billing.countDocuments({ organization: organization._id })).toBe(0);
    // The previously-missing collections — the actual gap this fix closes.
    expect(await BillingEvent.countDocuments({ organization: organization._id })).toBe(0);
    expect(await Vendor.countDocuments({ organization: organization._id })).toBe(0);
    expect(await Invitation.countDocuments({ organization: organization._id })).toBe(0);
    expect(await UserSettings.countDocuments({ user: user._id })).toBe(0);
  });

  it("blocks deletion when the user owns an org with other members, and changes nothing", async () => {
    const { organization, user, token } = await seedFullAccount();
    const otherUser = await User.create({
      fullName: "Other Member",
      email: `other-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: otherUser._id, organization: organization._id, role: "member" });

    const response = await request(app)
      .delete("/api/auth/account")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(await User.findById(user._id)).not.toBeNull();
    expect(await Organization.findById(organization._id)).not.toBeNull();
  });

  it("is atomic — if one delete in the cascade fails, NOTHING is deleted (transaction rolls back)", async () => {
    const { organization, user, token, billing } = await seedFullAccount();

    // Billing is deleted first in the cascade's own sequence; Vendor comes
    // later. Fail Vendor's delete and confirm Billing (deleted earlier in
    // the SAME transaction) is still there afterward — proof the whole
    // transaction rolled back, not just that it stopped partway.
    const vendorSpy = vi
      .spyOn(Vendor, "deleteMany")
      .mockRejectedValueOnce(new Error("simulated failure mid-cascade"));

    const response = await request(app)
      .delete("/api/auth/account")
      .set("Authorization", `Bearer ${token}`);

    vendorSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(await User.findById(user._id)).not.toBeNull();
    expect(await Organization.findById(organization._id)).not.toBeNull();
    expect(await Billing.findById(billing._id)).not.toBeNull();
    expect(await Vendor.countDocuments({ organization: organization._id })).toBe(1);
  });
});
