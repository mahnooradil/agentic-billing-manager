import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { Billing } from "@/models/billing.model";
import { SenderProfile } from "@/models/sender-profile.model";
import { Notification } from "@/models/notification.model";
import { evaluateOrganization } from "@/services/email-sync/sender-profile-scheduler";

describe("evaluateOrganization (WP-11 nightly trust evaluation)", () => {
  async function seedOldBilling(organization: Types.ObjectId, domain: string, daysOld: number) {
    // `createdAt` must be passed AT creation — `timestamps: true` makes it
    // an immutable path, so a later `updateOne({$set: {createdAt}})` is
    // silently dropped (confirmed directly before writing these tests).
    return Billing.create({
      organization,
      user: new Types.ObjectId(),
      platformConnection: new Types.ObjectId(),
      source: "email_sync",
      externalId: `ext-${new Types.ObjectId().toString()}`,
      customerName: "Workspace",
      senderDomain: domain,
      invoiceNumber: `INV-${new Types.ObjectId().toString()}`,
      amount: 10,
      currency: "USD",
      billingDate: new Date(),
      status: "Paid",
      createdAt: new Date(Date.now() - daysOld * 86_400_000),
    });
  }

  it("suppresses a domain with 3+ false positives and 0 confirmed invoices, and notifies", async () => {
    const org = new Types.ObjectId();
    await SenderProfile.create({
      organization: org,
      domain: "bad-sender.test",
      trust: "neutral",
      falsePositiveCount: 3,
      confirmedInvoiceCount: 0,
    });

    await evaluateOrganization(org.toString());

    const profile = await SenderProfile.findOne({ organization: org, domain: "bad-sender.test" });
    expect(profile?.trust).toBe("suppressed");
    expect(profile?.lastEvaluatedAt).toBeInstanceOf(Date);

    const notifications = await Notification.find({ organization: org });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toMatch(/muted/i);
    expect(notifications[0].message).toContain("bad-sender.test");
  });

  it("does NOT suppress with only 2 false positives (below the threshold)", async () => {
    const org = new Types.ObjectId();
    await SenderProfile.create({
      organization: org,
      domain: "borderline.test",
      trust: "neutral",
      falsePositiveCount: 2,
      confirmedInvoiceCount: 0,
    });

    await evaluateOrganization(org.toString());

    const profile = await SenderProfile.findOne({ organization: org, domain: "borderline.test" });
    expect(profile?.trust).toBe("neutral");
  });

  it("does NOT suppress a domain with false positives if it ALSO has a confirmed invoice (ambiguous signal)", async () => {
    const org = new Types.ObjectId();
    await SenderProfile.create({
      organization: org,
      domain: "mixed-signal.test",
      trust: "neutral",
      falsePositiveCount: 5,
    });
    await seedOldBilling(org, "mixed-signal.test", 10);

    await evaluateOrganization(org.toString());

    const profile = await SenderProfile.findOne({ organization: org, domain: "mixed-signal.test" });
    expect(profile?.trust).toBe("neutral");
    expect(profile?.confirmedInvoiceCount).toBe(1);
  });

  it("marks a domain trusted once it has 3+ confirmed (old enough, undeleted) invoices", async () => {
    const org = new Types.ObjectId();
    await SenderProfile.create({ organization: org, domain: "reliable.test", trust: "neutral" });
    await seedOldBilling(org, "reliable.test", 10);
    await seedOldBilling(org, "reliable.test", 15);
    await seedOldBilling(org, "reliable.test", 20);

    await evaluateOrganization(org.toString());

    const profile = await SenderProfile.findOne({ organization: org, domain: "reliable.test" });
    expect(profile?.trust).toBe("trusted");
    expect(profile?.confirmedInvoiceCount).toBe(3);
  });

  it("a record synced too recently does NOT count toward confirmedInvoiceCount yet (grace period)", async () => {
    const org = new Types.ObjectId();
    await SenderProfile.create({ organization: org, domain: "too-new.test", trust: "neutral" });
    // All synced "now" — well inside the 3-day grace window.
    await seedOldBilling(org, "too-new.test", 0);
    await seedOldBilling(org, "too-new.test", 0);
    await seedOldBilling(org, "too-new.test", 0);

    await evaluateOrganization(org.toString());

    const profile = await SenderProfile.findOne({ organization: org, domain: "too-new.test" });
    expect(profile?.confirmedInvoiceCount).toBe(0);
    expect(profile?.trust).toBe("neutral");
  });

  it("NEVER touches a manuallySet profile — a human's own choice always wins", async () => {
    const org = new Types.ObjectId();
    await SenderProfile.create({
      organization: org,
      domain: "human-decided.test",
      trust: "suppressed",
      manuallySet: true,
      falsePositiveCount: 0, // would otherwise auto-revert to neutral
      confirmedInvoiceCount: 0,
    });
    await seedOldBilling(org, "human-decided.test", 10);
    await seedOldBilling(org, "human-decided.test", 15);
    await seedOldBilling(org, "human-decided.test", 20);

    await evaluateOrganization(org.toString());

    const profile = await SenderProfile.findOne({ organization: org, domain: "human-decided.test" });
    // Still suppressed, untouched — even though 3 confirmed invoices exist,
    // which would normally flip an auto-learned profile to trusted.
    expect(profile?.trust).toBe("suppressed");
    expect(profile?.manuallySet).toBe(true);
  });

  it("does not send a second notification for a domain that was already suppressed", async () => {
    const org = new Types.ObjectId();
    await SenderProfile.create({
      organization: org,
      domain: "already-muted.test",
      trust: "suppressed",
      falsePositiveCount: 4,
      confirmedInvoiceCount: 0,
    });

    await evaluateOrganization(org.toString());

    const notifications = await Notification.find({ organization: org });
    expect(notifications).toHaveLength(0);
  });

  it("a domain that no longer meets either threshold reverts to neutral", async () => {
    const org = new Types.ObjectId();
    // Previously trusted, but confirmedInvoiceCount will be recomputed to 0
    // this pass (its only record is too new to count) — must revert, not
    // stay stuck on a stale "trusted" label.
    await SenderProfile.create({
      organization: org,
      domain: "no-longer-qualifying.test",
      trust: "trusted",
      confirmedInvoiceCount: 3,
    });
    await seedOldBilling(org, "no-longer-qualifying.test", 0); // too new

    await evaluateOrganization(org.toString());

    const profile = await SenderProfile.findOne({ organization: org, domain: "no-longer-qualifying.test" });
    expect(profile?.trust).toBe("neutral");
    expect(profile?.confirmedInvoiceCount).toBe(0);
  });

  it("scopes strictly by organization — one org's evaluation never touches another's profiles", async () => {
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    await SenderProfile.create({
      organization: orgA,
      domain: "shared-name.test",
      trust: "neutral",
      falsePositiveCount: 3,
    });
    await SenderProfile.create({
      organization: orgB,
      domain: "shared-name.test",
      trust: "neutral",
      falsePositiveCount: 0,
    });

    await evaluateOrganization(orgA.toString());

    const profileA = await SenderProfile.findOne({ organization: orgA, domain: "shared-name.test" });
    const profileB = await SenderProfile.findOne({ organization: orgB, domain: "shared-name.test" });
    expect(profileA?.trust).toBe("suppressed");
    expect(profileB?.trust).toBe("neutral"); // untouched — evaluateOrganization(orgA) only
  });
});
