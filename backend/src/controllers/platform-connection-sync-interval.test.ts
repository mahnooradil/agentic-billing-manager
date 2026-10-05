import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";
import { PlatformConnection } from "@/models/platform-connection.model";

const app = createApp();

/** The sync-frequency override a user can set from the Automation page
 *  (PATCH /platform-connections/:id's syncIntervalMinutes field). */
describe("Platform connection sync-frequency override (real HTTP)", () => {
  async function seedUser() {
    const organization = await Organization.create({ name: "Sync Interval Test Org" });
    const user = await User.create({
      fullName: "Sync Interval Test User",
      email: `sync-interval-${Date.now()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });
    return { organization, user, token };
  }

  async function seedConnection(organizationId: string, userId: string) {
    return PlatformConnection.create({
      organization: organizationId,
      user: userId,
      platform: "gmail",
      accountIdentifier: "sync-interval-test@gmail.com",
      displayName: "Sync Interval Test",
      status: "connected",
      connectionType: "oauth",
    });
  }

  it("sets a valid sync interval override", async () => {
    const { organization, user, token } = await seedUser();
    const connection = await seedConnection(organization._id.toString(), user._id.toString());

    const res = await request(app)
      .patch(`/api/platform-connections/${connection._id.toString()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ syncIntervalMinutes: 15 });

    expect(res.status).toBe(200);
    expect(res.body.data.connection.syncIntervalMinutes).toBe(15);

    const reloaded = await PlatformConnection.findById(connection._id);
    expect(reloaded?.syncIntervalMinutes).toBe(15);
  });

  it("clears an override back to the default when sent null", async () => {
    const { organization, user, token } = await seedUser();
    const connection = await seedConnection(organization._id.toString(), user._id.toString());
    await PlatformConnection.updateOne({ _id: connection._id }, { $set: { syncIntervalMinutes: 1440 } });

    const res = await request(app)
      .patch(`/api/platform-connections/${connection._id.toString()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ syncIntervalMinutes: null });

    expect(res.status).toBe(200);
    expect(res.body.data.connection.syncIntervalMinutes).toBeNull();

    const reloaded = await PlatformConnection.findById(connection._id);
    expect(reloaded?.syncIntervalMinutes).toBeUndefined();
  });

  it("rejects a value outside the allowed set (zod)", async () => {
    const { organization, user, token } = await seedUser();
    const connection = await seedConnection(organization._id.toString(), user._id.toString());

    const res = await request(app)
      .patch(`/api/platform-connections/${connection._id.toString()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ syncIntervalMinutes: 5 });

    expect(res.status).toBe(400);

    const reloaded = await PlatformConnection.findById(connection._id);
    expect(reloaded?.syncIntervalMinutes).toBeUndefined();
  });

  it("a field left out of the request body is never touched", async () => {
    const { organization, user, token } = await seedUser();
    const connection = await seedConnection(organization._id.toString(), user._id.toString());
    await PlatformConnection.updateOne({ _id: connection._id }, { $set: { syncIntervalMinutes: 180 } });

    const res = await request(app)
      .patch(`/api/platform-connections/${connection._id.toString()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "Renamed, interval untouched" });

    expect(res.status).toBe(200);
    expect(res.body.data.connection.syncIntervalMinutes).toBe(180);
  });

  it("scopes strictly by organization — another org's connection never leaks or updates", async () => {
    const { token } = await seedUser();
    const otherOrg = await Organization.create({ name: "Other Sync Interval Org" });
    const otherUser = await User.create({
      fullName: "Other Org User",
      email: `sync-interval-other-${Date.now()}@example.com`,
      activeOrganizationId: otherOrg._id,
    });
    const otherConnection = await seedConnection(otherOrg._id.toString(), otherUser._id.toString());

    const res = await request(app)
      .patch(`/api/platform-connections/${otherConnection._id.toString()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ syncIntervalMinutes: 15 });

    expect(res.status).toBe(404);

    const reloaded = await PlatformConnection.findById(otherConnection._id);
    expect(reloaded?.syncIntervalMinutes).toBeUndefined();
  });
});
