import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";
import { Subscription } from "@/models/subscription.model";

const app = createApp();

/**
 * Task 10's client-facing guarantee: a paid tier is never grantable through
 * PUT /api/plan directly, only through the (Stripe-configured-or-not)
 * checkout endpoint — verified through the real HTTP routes, not just the
 * service function.
 */
describe("PUT /api/plan / POST /api/plan/checkout (Task 10)", () => {
  async function seedAuthedOwner() {
    const organization = await Organization.create({ name: "Test Org" });
    const user = await User.create({
      fullName: "Test Owner",
      email: `owner-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    return { organization, user, token };
  }

  it("PUT /api/plan rejects an attempt to self-upgrade to a paid tier", async () => {
    const { token } = await seedAuthedOwner();

    const response = await request(app)
      .put("/api/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "Business" });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/checkout/i);
  });

  it("PUT /api/plan still allows a downgrade to Free", async () => {
    const { organization, token } = await seedAuthedOwner();
    organization.planTier = "Pro";
    await organization.save();

    const response = await request(app)
      .put("/api/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "Free" });

    expect(response.status).toBe(200);
    expect(response.body.data.plan.tier).toBe("Free");
  });

  it("a downgrade to Free cancels an active Stripe subscription record's entitlement locally too", async () => {
    const { organization, token } = await seedAuthedOwner();
    organization.planTier = "Business";
    organization.stripeCustomerId = "cus_test_plan_checkout";
    await organization.save();
    await Subscription.create({
      organization: organization._id,
      stripeSubscriptionId: "sub_test_plan_checkout",
      stripeCustomerId: "cus_test_plan_checkout",
      stripePriceId: "price_test_business",
      planTier: "Business",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      lastEventAt: new Date(),
    });

    const response = await request(app)
      .put("/api/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "Free" });

    // Succeeds locally even though there's no real Stripe account to reach
    // (cancelActiveSubscription is best-effort — see its own docstring);
    // the organization's own tier is what this test actually asserts.
    expect(response.status).toBe(200);
    const reloaded = await Organization.findById(organization._id);
    expect(reloaded?.planTier).toBe("Free");
  });

  it("POST /api/plan/checkout reports 'not configured' when Stripe isn't set up (this environment has no Stripe keys)", async () => {
    const { token } = await seedAuthedOwner();

    const response = await request(app)
      .post("/api/plan/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "Pro" });

    expect(response.status).toBe(503);
  });

  it("a member (not owner/admin) cannot change the plan", async () => {
    const organization = await Organization.create({ name: "Member Org" });
    const user = await User.create({
      fullName: "Test Member",
      email: `member-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "member" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });

    const response = await request(app)
      .put("/api/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ tier: "Free" });

    expect(response.status).toBe(403);
  });
});
