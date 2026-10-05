import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { SenderProfile } from "@/models/sender-profile.model";
import { ClassificationFeedback } from "@/models/classification-feedback.model";
import {
  resolveSenderProfile,
  isSenderSuppressed,
  isSenderTrusted,
  recordFalsePositive,
  suppressSenderManually,
  restoreSender,
} from "@/services/email-sync/sender-trust.service";

describe("sender-trust.service", () => {
  describe("resolveSenderProfile", () => {
    it("creates a new profile starting neutral with zero counts", async () => {
      const org = new Types.ObjectId();
      const profile = await resolveSenderProfile(org, "Example.COM");
      expect(profile.domain).toBe("example.com"); // normalized lowercase
      expect(profile.trust).toBe("neutral");
      expect(profile.confirmedInvoiceCount).toBe(0);
      expect(profile.falsePositiveCount).toBe(0);
    });

    it("returns the SAME profile on a second call for the same domain (upsert, not duplicate)", async () => {
      const org = new Types.ObjectId();
      const first = await resolveSenderProfile(org, "netflix.com");
      const second = await resolveSenderProfile(org, "netflix.com");
      expect(first._id.toString()).toBe(second._id.toString());
      const count = await SenderProfile.countDocuments({ organization: org, domain: "netflix.com" });
      expect(count).toBe(1);
    });
  });

  describe("isSenderSuppressed / isSenderTrusted", () => {
    it("a brand-new (never-seen) domain is neither suppressed nor trusted, and creates no row", async () => {
      const org = new Types.ObjectId();
      expect(await isSenderSuppressed(org, "unknown-domain.test")).toBe(false);
      expect(await isSenderTrusted(org, "unknown-domain.test")).toBe(false);
      const count = await SenderProfile.countDocuments({ organization: org });
      expect(count).toBe(0);
    });

    it("reflects a domain explicitly marked suppressed/trusted", async () => {
      const org = new Types.ObjectId();
      await SenderProfile.create({ organization: org, domain: "spammy.test", trust: "suppressed" });
      await SenderProfile.create({ organization: org, domain: "good.test", trust: "trusted" });

      expect(await isSenderSuppressed(org, "spammy.test")).toBe(true);
      expect(await isSenderTrusted(org, "spammy.test")).toBe(false);
      expect(await isSenderTrusted(org, "good.test")).toBe(true);
      expect(await isSenderSuppressed(org, "good.test")).toBe(false);
    });

    it("scopes strictly by organization — never cross-tenant", async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      await SenderProfile.create({ organization: orgA, domain: "shared.test", trust: "suppressed" });

      expect(await isSenderSuppressed(orgA, "shared.test")).toBe(true);
      expect(await isSenderSuppressed(orgB, "shared.test")).toBe(false);
    });
  });

  describe("recordFalsePositive", () => {
    it("increments falsePositiveCount and appends a ClassificationFeedback entry", async () => {
      const org = new Types.ObjectId();
      const billingId = new Types.ObjectId();

      await recordFalsePositive(org, "wrongly-flagged.test", {
        billing: billingId,
        sourceMessageId: "msg-1",
      });

      const profile = await SenderProfile.findOne({ organization: org, domain: "wrongly-flagged.test" });
      expect(profile?.falsePositiveCount).toBe(1);

      const feedback = await ClassificationFeedback.find({ organization: org });
      expect(feedback).toHaveLength(1);
      expect(feedback[0].userVerdict).toBe("false_positive");
      expect(feedback[0].billing?.toString()).toBe(billingId.toString());
    });

    it("accumulates across repeated calls for the same domain", async () => {
      const org = new Types.ObjectId();
      await recordFalsePositive(org, "repeat-offender.test", {});
      await recordFalsePositive(org, "repeat-offender.test", {});
      await recordFalsePositive(org, "repeat-offender.test", {});

      const profile = await SenderProfile.findOne({ organization: org, domain: "repeat-offender.test" });
      expect(profile?.falsePositiveCount).toBe(3);
      const feedback = await ClassificationFeedback.find({ organization: org });
      expect(feedback).toHaveLength(3);
    });
  });

  describe("suppressSenderManually / restoreSender", () => {
    it("manually suppressing sets trust and manuallySet together", async () => {
      const org = new Types.ObjectId();
      const profile = await suppressSenderManually(org, "annoying.test");
      expect(profile.trust).toBe("suppressed");
      expect(profile.manuallySet).toBe(true);
    });

    it("restore gives a genuine fresh start — resets trust, manuallySet, AND the false-positive count", async () => {
      const org = new Types.ObjectId();
      await SenderProfile.create({
        organization: org,
        domain: "reconsidered.test",
        trust: "suppressed",
        manuallySet: true,
        falsePositiveCount: 5,
      });

      const restored = await restoreSender(org, "reconsidered.test");
      expect(restored?.trust).toBe("neutral");
      expect(restored?.manuallySet).toBe(false);
      // Not reset to 0, the whole point would be defeated if the nightly
      // job could immediately re-suppress on its very next pass.
      expect(restored?.falsePositiveCount).toBe(0);
    });

    it("restoring a domain with no profile at all returns null, doesn't throw", async () => {
      const org = new Types.ObjectId();
      const result = await restoreSender(org, "never-seen.test");
      expect(result).toBeNull();
    });
  });
});
