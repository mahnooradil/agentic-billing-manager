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
import { SenderProfile } from "@/models/sender-profile.model";
import { ClassificationFeedback } from "@/models/classification-feedback.model";

const app = createApp();

async function seedUserWithRole(role: MembershipRole) {
  const organization = await Organization.create({ name: "Sender Profile Test Org" });
  const user = await User.create({
    fullName: "Test User",
    email: `sender-profile-${new Types.ObjectId().toString()}@example.com`,
    activeOrganizationId: organization._id,
  });
  await Membership.create({ user: user._id, organization: organization._id, role });
  const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
  return { organization, user, token };
}

describe("GET /api/sender-profiles (WP-11)", () => {
  it("lists non-neutral profiles, scoped to the caller's organization", async () => {
    const { organization, token } = await seedUserWithRole("owner");
    await SenderProfile.create({ organization: organization._id, domain: "trusted.test", trust: "trusted" });
    await SenderProfile.create({ organization: organization._id, domain: "muted.test", trust: "suppressed" });
    await SenderProfile.create({ organization: organization._id, domain: "unseen.test", trust: "neutral" });
    const otherOrg = await Organization.create({ name: "Other Org" });
    await SenderProfile.create({ organization: otherOrg._id, domain: "trusted.test", trust: "trusted" });

    const res = await request(app).get("/api/sender-profiles").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const domains = res.body.data.profiles.map((p: { domain: string }) => p.domain).sort();
    expect(domains).toEqual(["muted.test", "trusted.test"]); // neutral excluded, other org excluded
  });
});

describe("POST /api/sender-profiles/:id/suppress and /restore (WP-11)", () => {
  it("owner/admin can manually suppress a sender", async () => {
    const { organization, token } = await seedUserWithRole("owner");
    const profile = await SenderProfile.create({ organization: organization._id, domain: "annoying.test" });

    const res = await request(app)
      .post(`/api/sender-profiles/${profile._id.toString()}/suppress`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile.trust).toBe("suppressed");
    expect(res.body.data.profile.manuallySet).toBe(true);
  });

  it("a member cannot suppress or restore (403) — RBAC matches other billing-affecting mutations", async () => {
    const { organization, token } = await seedUserWithRole("member");
    const profile = await SenderProfile.create({ organization: organization._id, domain: "annoying.test" });

    const suppressRes = await request(app)
      .post(`/api/sender-profiles/${profile._id.toString()}/suppress`)
      .set("Authorization", `Bearer ${token}`);
    expect(suppressRes.status).toBe(403);

    const restoreRes = await request(app)
      .post(`/api/sender-profiles/${profile._id.toString()}/restore`)
      .set("Authorization", `Bearer ${token}`);
    expect(restoreRes.status).toBe(403);
  });

  it("restore undoes a suppression end-to-end over real HTTP", async () => {
    const { organization, token } = await seedUserWithRole("owner");
    const profile = await SenderProfile.create({
      organization: organization._id,
      domain: "reconsidered.test",
      trust: "suppressed",
      manuallySet: true,
      falsePositiveCount: 5,
    });

    const res = await request(app)
      .post(`/api/sender-profiles/${profile._id.toString()}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile.trust).toBe("neutral");
    expect(res.body.data.profile.falsePositiveCount).toBe(0);
  });

  it("404 for a sender profile belonging to a different organization (never leaks existence)", async () => {
    const { token } = await seedUserWithRole("owner");
    const otherOrg = await Organization.create({ name: "Other Org 2" });
    const otherProfile = await SenderProfile.create({ organization: otherOrg._id, domain: "not-yours.test" });

    const res = await request(app)
      .post(`/api/sender-profiles/${otherProfile._id.toString()}/suppress`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/billing/:id records WP-11 feedback for an email_sync record", () => {
  async function createEmailSyncBilling(organizationId: Types.ObjectId, userId: Types.ObjectId) {
    return Billing.create({
      organization: organizationId,
      user: userId,
      platformConnection: new Types.ObjectId(),
      source: "email_sync",
      externalId: `ext-${new Types.ObjectId().toString()}`,
      customerName: "Workspace",
      senderDomain: "wrongly-flagged.test",
      sourceMessageId: "msg-fp-1",
      invoiceNumber: "INV-FP-1",
      amount: 15,
      currency: "USD",
      billingDate: new Date(),
      status: "Pending",
    });
  }

  it("deleting an email_sync record increments the sender's falsePositiveCount and logs feedback", async () => {
    const { organization, user, token } = await seedUserWithRole("owner");
    const billing = await createEmailSyncBilling(organization._id, user._id);

    const res = await request(app)
      .delete(`/api/billing/${billing._id.toString()}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const profile = await SenderProfile.findOne({
      organization: organization._id,
      domain: "wrongly-flagged.test",
    });
    expect(profile?.falsePositiveCount).toBe(1);

    const feedback = await ClassificationFeedback.find({ organization: organization._id });
    expect(feedback).toHaveLength(1);
    expect(feedback[0].userVerdict).toBe("false_positive");
    expect(feedback[0].sourceMessageId).toBe("msg-fp-1");
  });

  it("deleting a MANUAL record does NOT record sender-trust feedback (no sender domain to attribute it to)", async () => {
    const { organization, user, token } = await seedUserWithRole("owner");
    const platform = await Platform.create({
      organization: organization._id,
      user: user._id,
      name: "Manual Platform",
      slug: `manual-platform-${new Types.ObjectId().toString()}`,
    });
    const billing = await Billing.create({
      organization: organization._id,
      user: user._id,
      platform: platform._id,
      source: "manual",
      customerName: "Acme",
      invoiceNumber: "INV-MANUAL-1",
      amount: 10,
      currency: "USD",
      billingDate: new Date(),
      status: "Pending",
    });

    await request(app)
      .delete(`/api/billing/${billing._id.toString()}`)
      .set("Authorization", `Bearer ${token}`);

    const feedback = await ClassificationFeedback.find({ organization: organization._id });
    expect(feedback).toHaveLength(0);
  });
});
