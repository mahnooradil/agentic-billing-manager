import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";
import { Platform } from "@/models/platform.model";
import { Billing } from "@/models/billing.model";
import { executeCustomTool } from "@/services/agent/agent-tools";

/**
 * WP-7's org-id consolidation (flow/01 item #5, flow/04 §8). Before this fix,
 * every agent tool re-derived its organization from `User.activeOrganizationId`
 * independently — a real race if the user switches their active workspace
 * mid-turn (between when `sendAgentMessage` resolved `organizationId` for
 * this turn and when a tool actually runs). This test proves the fix
 * directly: a tool call explicitly scoped to Org A must return Org A's data
 * even when the calling user's CURRENT `activeOrganizationId` has already
 * moved on to Org B — i.e. tools no longer look at the user's live profile
 * at all, only the organizationId they were explicitly handed.
 */
describe("executeCustomTool is scoped by the explicit organizationId, not the user's live activeOrganizationId", () => {
  it("get_platform_summary reflects the PASSED org, even after the user's active org has switched to a different one", async () => {
    const orgA = await Organization.create({ name: "Org A" });
    const orgB = await Organization.create({ name: "Org B" });
    const user = await User.create({
      fullName: "Switching User",
      email: `switch-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: orgA._id,
    });
    await Membership.create({ user: user._id, organization: orgA._id, role: "owner" });
    await Membership.create({ user: user._id, organization: orgB._id, role: "owner" });

    await Platform.create({
      organization: orgA._id,
      user: user._id,
      name: "Org A Platform",
      slug: `org-a-platform-${new Types.ObjectId().toString()}`,
      status: "Active",
    });
    await Platform.create({
      organization: orgB._id,
      user: user._id,
      name: "Org B Platform 1",
      slug: `org-b-platform-1-${new Types.ObjectId().toString()}`,
      status: "Active",
    });
    await Platform.create({
      organization: orgB._id,
      user: user._id,
      name: "Org B Platform 2",
      slug: `org-b-platform-2-${new Types.ObjectId().toString()}`,
      status: "Active",
    });

    // The chat turn started while the user was in Org A (sendAgentMessage
    // resolves organizationId once, up front, from the live request).
    const turnOrganizationId = orgA._id.toString();

    // Mid-turn, the user switches their active workspace to Org B (e.g. a
    // second browser tab, or a genuinely concurrent request).
    await User.updateOne({ _id: user._id }, { $set: { activeOrganizationId: orgB._id } });

    const result = (await executeCustomTool(turnOrganizationId, "get_platform_summary", {})) as {
      totalPlatforms: number;
    };

    // Must still reflect Org A (1 platform) — NOT Org B (2 platforms), which
    // is what the old userId-based re-derivation would have returned.
    expect(result.totalPlatforms).toBe(1);
  });

  it("search_billing_records is scoped the same way", async () => {
    const orgA = await Organization.create({ name: "Org A" });
    const orgB = await Organization.create({ name: "Org B" });
    const user = await User.create({
      fullName: "Switching User 2",
      email: `switch2-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: orgA._id,
    });
    await Membership.create({ user: user._id, organization: orgA._id, role: "owner" });
    await Membership.create({ user: user._id, organization: orgB._id, role: "owner" });

    const platformA = await Platform.create({
      organization: orgA._id,
      user: user._id,
      name: "Platform A",
      slug: `platform-a-${new Types.ObjectId().toString()}`,
    });
    await Billing.create({
      organization: orgA._id,
      user: user._id,
      platform: platformA._id,
      source: "manual",
      customerName: "Org A Customer",
      invoiceNumber: "ORGA-1",
      amount: 10,
      currency: "USD",
      billingDate: new Date(),
      status: "Pending",
    });

    const platformB = await Platform.create({
      organization: orgB._id,
      user: user._id,
      name: "Platform B",
      slug: `platform-b-${new Types.ObjectId().toString()}`,
    });
    await Billing.create({
      organization: orgB._id,
      user: user._id,
      platform: platformB._id,
      source: "manual",
      customerName: "Org B Customer",
      invoiceNumber: "ORGB-1",
      amount: 20,
      currency: "USD",
      billingDate: new Date(),
      status: "Pending",
    });

    await User.updateOne({ _id: user._id }, { $set: { activeOrganizationId: orgB._id } });

    const result = (await executeCustomTool(orgA._id.toString(), "search_billing_records", {})) as {
      matchCount: number;
      records: { invoiceNumber: string }[];
    };

    expect(result.matchCount).toBe(1);
    expect(result.records[0]?.invoiceNumber).toBe("ORGA-1");
  });
});
