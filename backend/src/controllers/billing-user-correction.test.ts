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
import { BillingEvent } from "@/models/billing-event.model";
import { recordBillingEvent } from "@/services/billing/billing-event-recorder.service";

const app = createApp();

/**
 * End-to-end (real HTTP route, not just the underlying function) check of
 * Task 8's "manual override always wins and is recorded as an event"
 * acceptance criterion, through the actual PUT /api/billing/:id path a real
 * user/the Billing page uses — not just the service function in isolation.
 */
describe("PUT /api/billing/:id records a user_correction event", () => {
  async function seedAuthedUser() {
    const organization = await Organization.create({ name: "Test Org" });
    const user = await User.create({
      fullName: "Test User",
      email: `user-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    return { organization, user, token };
  }

  it("changing the status via the API creates a user_correction event and updates derivedStatus", async () => {
    const { organization, user, token } = await seedAuthedUser();

    const connection = await PlatformConnection.create({
      organization: organization._id,
      user: user._id,
      platform: "gmail",
      accountIdentifier: "inbox@example.com",
      displayName: "Gmail",
      status: "connected",
      connectionType: "oauth",
    });

    const billing = await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: connection._id,
      source: "email_sync",
      externalId: "gmail-inv-netflix-correction-test",
      customerName: "Test Org",
      vendorName: "Netflix",
      invoiceNumber: "NF-CORR-1",
      amount: 15.99,
      currency: "USD",
      billingDate: new Date(),
      status: "Pending",
    });

    // A synced payment confirmation already exists in this record's history.
    await recordBillingEvent({
      organization: organization._id,
      billing: billing._id,
      type: "payment_confirmed",
      occurredAt: new Date(),
      confidence: 0.9,
      source: "email_sync",
    });

    const response = await request(app)
      .put(`/api/billing/${billing._id.toString()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Overdue" });

    expect(response.status).toBe(200);
    expect(response.body.data.billingRecord.status).toBe("Overdue");

    const events = await BillingEvent.find({ billing: billing._id, type: "user_correction" });
    expect(events).toHaveLength(1);
    expect(events[0]?.correctedStatus).toBe("Overdue");
    expect(events[0]?.source).toBe("user");
    expect(events[0]?.createdBy?.toString()).toBe(user._id.toString());

    const reloaded = await Billing.findById(billing._id);
    // The real status field reflects the direct edit, as it always has.
    expect(reloaded?.status).toBe("Overdue");
    // AND the independent derived layer now agrees, because a
    // user_correction always wins in deriveStatus() — overriding what would
    // otherwise still read "paid" from the earlier synced event.
    expect(reloaded?.derivedStatus).toBe("overdue");
    expect(reloaded?.derivedStatusBasis).toBe("user");
  });

  it("saving the SAME status again does not create a duplicate user_correction event", async () => {
    const { organization, user, token } = await seedAuthedUser();
    const connection = await PlatformConnection.create({
      organization: organization._id,
      user: user._id,
      platform: "gmail",
      accountIdentifier: "inbox2@example.com",
      displayName: "Gmail",
      status: "connected",
      connectionType: "oauth",
    });
    const billing = await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: connection._id,
      source: "email_sync",
      externalId: "gmail-inv-netflix-correction-test-2",
      customerName: "Test Org",
      invoiceNumber: "NF-CORR-2",
      amount: 5,
      currency: "USD",
      billingDate: new Date(),
      status: "Pending",
    });

    const response = await request(app)
      .put(`/api/billing/${billing._id.toString()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Pending", notes: "just a note update" });

    expect(response.status).toBe(200);
    const events = await BillingEvent.find({ billing: billing._id });
    expect(events).toHaveLength(0);
  });
});
