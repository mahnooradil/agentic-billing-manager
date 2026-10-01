import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Billing } from "@/models/billing.model";

const app = createApp();

/**
 * Real user-reported bug: "View in Gmail" opened whichever Google account
 * happened to be active in the browser, not the connected inbox — because
 * the link used `/mail/u/0/` (browser account INDEX), and the backend never
 * even sent the connected mailbox's own address to build a better link with.
 * Fix: expose the connection's `accountIdentifier` (the real connected
 * inbox's email) on `platform.accountIdentifier`, through the actual
 * GET /api/billing/:id route, not just the underlying serializer function.
 */
describe("Billing platform ref carries the connected inbox's own address", () => {
  it("GET /api/billing/:id exposes platform.accountIdentifier for an email_sync record", async () => {
    const organization = await Organization.create({ name: "Test Org" });
    const user = await User.create({
      fullName: "Test User",
      email: `user-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });

    const connection = await PlatformConnection.create({
      organization: organization._id,
      user: user._id,
      platform: "gmail",
      accountIdentifier: "my-real-inbox@gmail.com",
      displayName: "Gmail",
      status: "connected",
      connectionType: "oauth",
    });

    const billing = await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: connection._id,
      source: "email_sync",
      externalId: "gmail-source-link-test",
      customerName: "Acme",
      vendorName: "Netflix",
      invoiceNumber: "NF-LINK-1",
      amount: 15.99,
      currency: "USD",
      billingDate: new Date(),
      sourceMessageId: "msg-abc-123",
    });

    const response = await request(app)
      .get(`/api/billing/${billing._id.toString()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.billingRecord.platform.accountIdentifier).toBe(
      "my-real-inbox@gmail.com"
    );
    expect(response.body.data.billingRecord.platform.slug).toBe("gmail");
  });

  it("GET /api/billing (list) also carries platform.accountIdentifier", async () => {
    const organization = await Organization.create({ name: "Test Org 2" });
    const user = await User.create({
      fullName: "Test User 2",
      email: `user-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });

    const connection = await PlatformConnection.create({
      organization: organization._id,
      user: user._id,
      platform: "gmail",
      accountIdentifier: "another-inbox@gmail.com",
      displayName: "Gmail",
      status: "connected",
      connectionType: "oauth",
    });

    await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: connection._id,
      source: "email_sync",
      externalId: "gmail-source-link-list-test",
      customerName: "Acme",
      invoiceNumber: "NF-LINK-2",
      amount: 5,
      currency: "USD",
      billingDate: new Date(),
    });

    const response = await request(app)
      .get("/api/billing")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.billingRecords[0].platform.accountIdentifier).toBe(
      "another-inbox@gmail.com"
    );
  });
});
