import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { User } from "@/models/user.model";
import { Organization } from "@/models/organization.model";
import { Membership } from "@/models/membership.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Billing } from "@/models/billing.model";
import { billingSearchTool } from "@/services/ai/tools/billing-search.tool";

/**
 * Task 7's own acceptance test: "show invoices from AWS" (and similar vendor
 * queries) must actually return the right records through the agent's own
 * search tool — across BOTH an auto_sync record (vendor lives in
 * `customerName`) and an email_sync record (vendor lives in `vendorName`/
 * `vendorDomain`), not just one source.
 */
describe("search_billing_records vendor search", () => {
  async function seedOrgWithUser() {
    const organization = await Organization.create({ name: "Test Org" });
    const user = await User.create({
      fullName: "Test User",
      email: `user-${new Types.ObjectId().toString()}@example.com`,
      activeOrganizationId: organization._id,
    });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner" });
    return { organization, user };
  }

  it("finds an auto_sync AWS record by name and an email_sync Netflix record by domain", async () => {
    const { organization, user } = await seedOrgWithUser();

    const connection = await PlatformConnection.create({
      organization: organization._id,
      user: user._id,
      platform: "aws",
      accountIdentifier: "aws-account",
      displayName: "AWS",
      status: "connected",
      connectionType: "oauth",
    });

    // auto_sync — vendor identity lives in customerName (see
    // billing-sync/sync-engine.ts: customerName = connection.displayName).
    await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: connection._id,
      source: "auto_sync",
      externalId: "aws-inv-1",
      customerName: "AWS",
      invoiceNumber: "AWS-001",
      amount: 42,
      currency: "USD",
      billingDate: new Date(),
      status: "Pending",
    });

    // email_sync — vendor identity lives in vendorName/vendorDomain, NOT
    // customerName (which is the workspace's own org name for this source).
    await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: connection._id,
      source: "email_sync",
      externalId: "gmail-inv-netflix-1",
      customerName: "Test Org",
      vendorName: "Netflix",
      vendorDomain: "netflix.com",
      invoiceNumber: "NF-001",
      amount: 15.99,
      currency: "USD",
      billingDate: new Date(),
      status: "Paid",
    });

    // An unrelated record that must NOT show up in either search below.
    await Billing.create({
      organization: organization._id,
      user: user._id,
      platformConnection: connection._id,
      source: "email_sync",
      externalId: "gmail-inv-spotify-1",
      customerName: "Test Org",
      vendorName: "Spotify",
      vendorDomain: "spotify.com",
      invoiceNumber: "SP-001",
      amount: 9.99,
      currency: "USD",
      billingDate: new Date(),
      status: "Paid",
    });

    const awsResult = await billingSearchTool.run(organization._id.toString(), { customerName: "AWS" });
    expect(awsResult.matchCount).toBe(1);
    expect(awsResult.records[0]?.invoiceNumber).toBe("AWS-001");
    expect(awsResult.records[0]?.vendor).toBe("AWS");

    // Searching by the vendor's DOMAIN (not its display name) must also
    // find the Netflix record — this is the specific case a `vendorDomain`
    // parameter would cover, folded into the existing `customerName` input
    // instead of a new Console-registered parameter (see the tool's own
    // comment for why).
    const netflixByDomain = await billingSearchTool.run(organization._id.toString(), {
      customerName: "netflix.com",
    });
    expect(netflixByDomain.matchCount).toBe(1);
    expect(netflixByDomain.records[0]?.invoiceNumber).toBe("NF-001");
    expect(netflixByDomain.records[0]?.vendor).toBe("Netflix");
  });
});
