import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { generateToken } from "@/utils/jwt";
import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { UsageAccrual } from "@/models/usage-accrual.model";

const app = createApp();

/**
 * WP-4/WP-5's missing frontend piece — usage-accrual data (124 of 129
 * billing-sync adapters) had zero UI anywhere. Real HTTP route, scoped
 * directly to the real question a usage-visibility UI asks: "what's the
 * CURRENT balance per connected platform," not a full historical ledger.
 */
describe("GET /api/usage-accruals", () => {
  it("returns only the latest snapshot per connection, not every historical row", async () => {
    const organization = await Organization.create({ name: "Usage Test Org" });
    const user = await User.create({
      fullName: "Usage Test User",
      email: `usage-test-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    const token = generateToken({ id: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 });

    const vultrConnection = await PlatformConnection.create({
      organization: organization._id,
      user: user._id,
      platform: "vultr",
      accountIdentifier: "",
      displayName: "Vultr",
      status: "connected",
      connectionType: "oauth",
    });
    const herokuConnection = await PlatformConnection.create({
      organization: organization._id,
      user: user._id,
      platform: "heroku",
      accountIdentifier: "",
      displayName: "Heroku",
      status: "connected",
      connectionType: "oauth",
    });

    // Three days of Vultr snapshots — only the newest should come back.
    await UsageAccrual.create([
      {
        organization: organization._id,
        user: user._id,
        platformConnection: vultrConnection._id,
        externalId: "vultr-2026-09-01",
        amount: 10,
        currency: "USD",
        snapshotAt: new Date("2026-09-01"),
      },
      {
        organization: organization._id,
        user: user._id,
        platformConnection: vultrConnection._id,
        externalId: "vultr-2026-09-02",
        amount: 15,
        currency: "USD",
        snapshotAt: new Date("2026-09-02"),
      },
      {
        organization: organization._id,
        user: user._id,
        platformConnection: vultrConnection._id,
        externalId: "vultr-2026-09-03",
        amount: 22.5,
        currency: "USD",
        snapshotAt: new Date("2026-09-03"),
      },
      {
        organization: organization._id,
        user: user._id,
        platformConnection: herokuConnection._id,
        externalId: "heroku-2026-09-01",
        amount: 5,
        currency: "USD",
        snapshotAt: new Date("2026-09-01"),
      },
    ]);

    const response = await request(app)
      .get("/api/usage-accruals")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const accruals = response.body.data.accruals as {
      amount: number;
      connection: { displayName: string };
    }[];
    expect(accruals).toHaveLength(2);

    const vultrRow = accruals.find((a) => a.connection.displayName === "Vultr");
    const herokuRow = accruals.find((a) => a.connection.displayName === "Heroku");
    // The LATEST Vultr snapshot (Sept 3, $22.50), not the first or a sum.
    expect(vultrRow?.amount).toBe(22.5);
    expect(herokuRow?.amount).toBe(5);
  });
});
