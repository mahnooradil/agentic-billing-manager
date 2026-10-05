import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { Organization } from "@/models/organization.model";
import { assertCreditBalance } from "@/utils/credits";

/**
 * CLAUDE.md §10.3 — `assertCreditBalance` used to take the already-resolved
 * `OrganizationDocument` straight off `req.organization`, which can be up to
 * 5 seconds stale (`middlewares/auth-cache.ts`). The real-world consequence:
 * several agent-chat requests arriving within that window would ALL see the
 * same stale "I still have credits" snapshot and all pass the gate, each
 * then spending real credits — overdrawing a workspace by several turns'
 * worth instead of the single small overdraft the design already accepts.
 * These tests prove the fix at the right layer: given an id, the function
 * must reflect whatever the database says RIGHT NOW, not a snapshot handed
 * to it earlier.
 */
describe("assertCreditBalance (CLAUDE.md §10.3 — live balance, not a stale cached snapshot)", () => {
  it("allows the call when the organization has credits", async () => {
    const organization = await Organization.create({ name: "Credits Test Org", creditsBalance: 10 });
    await expect(assertCreditBalance(organization._id)).resolves.toBeUndefined();
  });

  it("throws 403 when the organization has exactly 0 credits", async () => {
    const organization = await Organization.create({ name: "Zero Org", creditsBalance: 0 });
    await expect(assertCreditBalance(organization._id)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("throws 403 when the organization is already negative", async () => {
    const organization = await Organization.create({ name: "Negative Org", creditsBalance: -3 });
    await expect(assertCreditBalance(organization._id)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("reflects a balance change made AFTER the organization was first loaded — the actual fix", async () => {
    const organization = await Organization.create({ name: "Live Read Org", creditsBalance: 5 });

    // Simulates the exact scenario the bug was about: some earlier step
    // already has an in-memory reference to this organization with its OLD
    // balance (e.g. a cached `req.organization`) — but credits were spent
    // to zero in the database in the meantime, by a concurrent request.
    const staleInMemoryCopy = await Organization.findById(organization._id);
    await Organization.updateOne({ _id: organization._id }, { $set: { creditsBalance: 0 } });

    // The stale in-memory copy would still (wrongly) say 5 — proving this
    // isn't a vacuous test.
    expect(staleInMemoryCopy?.creditsBalance).toBe(5);

    // assertCreditBalance must catch the REAL, current balance (0), not
    // whatever a stale snapshot would have said.
    await expect(assertCreditBalance(organization._id)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("throws 403 for an organization id that doesn't exist (never silently allows)", async () => {
    await expect(assertCreditBalance(new Types.ObjectId())).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
