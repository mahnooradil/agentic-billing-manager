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
 * WP-7 intent router, HTTP-level: the whole point is that a deterministic
 * answer must work even when the workspace is completely out of AI credits
 * (it never calls Claude), while anything NOT deterministically matched
 * still goes through the existing credit gate unchanged.
 */
describe("POST /api/agent/chat — intent router bypasses the credit gate (real HTTP)", () => {
  async function seedZeroCreditOrg() {
    const organization = await Organization.create({ name: "Zero Credit Org", creditsBalance: 0 });
    const user = await User.create({
      fullName: "Zero Credit User",
      email: `zero-credit-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    return { organization, user, token };
  }

  it("a deterministic question (aggregate) still answers correctly with ZERO credits", async () => {
    const { organization, user, token } = await seedZeroCreditOrg();
    const platform = await Platform.create({
      organization: organization._id,
      user: user._id,
      name: "Test Platform",
      slug: `test-platform-${new Types.ObjectId().toString()}`,
    });
    await Billing.create({
      organization: organization._id,
      user: user._id,
      platform: platform._id,
      source: "manual",
      customerName: "Acme",
      invoiceNumber: "INV-ROUTER-1",
      amount: 33.5,
      currency: "USD",
      billingDate: new Date(),
      status: "Paid",
    });

    const res = await request(app)
      .post("/api/agent/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "how much did I spend?" });

    expect(res.status).toBe(200);
    expect(res.body.data.message.content).toContain("33.50");

    const reloadedOrg = await Organization.findById(organization._id);
    expect(reloadedOrg?.creditsBalance).toBe(0); // unchanged — no credits spent
  });

  it("a non-deterministic question still hits the credit gate (403) with ZERO credits", async () => {
    const { token } = await seedZeroCreditOrg();

    const res = await request(app)
      .post("/api/agent/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "Can you help me understand my spending patterns and give advice?" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/used all its credits/i);
  });

  it("a deterministic 'why is invoice X' question also bypasses the credit gate", async () => {
    const { organization, user, token } = await seedZeroCreditOrg();
    const platform = await Platform.create({
      organization: organization._id,
      user: user._id,
      name: "Test Platform 2",
      slug: `test-platform-2-${new Types.ObjectId().toString()}`,
    });
    await Billing.create({
      organization: organization._id,
      user: user._id,
      platform: platform._id,
      source: "manual",
      customerName: "Acme",
      invoiceNumber: "INV-ROUTER-2",
      amount: 10,
      currency: "USD",
      billingDate: new Date(),
      status: "Overdue",
      manuallyEditedAt: new Date(),
    });

    const res = await request(app)
      .post("/api/agent/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "why is invoice INV-ROUTER-2 overdue?" });

    expect(res.status).toBe(200);
    expect(res.body.data.message.content).toMatch(/set manually/i);
  });
});
