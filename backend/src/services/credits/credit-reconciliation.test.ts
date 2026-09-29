import { describe, expect, it, vi } from "vitest";

import { Organization } from "@/models/organization.model";
import { CreditTransaction } from "@/models/credit-transaction.model";
import { runOnce } from "@/services/credits/credit-reconciliation-scheduler";

/**
 * Task 10's own acceptance item: a job comparing sum(CreditTransaction.amount)
 * against Organization.creditsBalance. Tests the detection logic (`runOnce`)
 * directly, matched via a console.error spy — the same observable contract
 * an operator watching logs would rely on — rather than the real 24h/5min
 * scheduler timers, which is what the module's own `startCreditReconciliation
 * Scheduler` wraps this in.
 */
describe("credit ledger reconciliation (Task 10)", () => {
  it("logs nothing when every organization's ledger matches its stored balance", async () => {
    await Organization.create({ name: "Reconciled Org", creditsBalance: 100 });
    const org = await Organization.findOne({ name: "Reconciled Org" });
    await CreditTransaction.create({
      organization: org!._id,
      type: "grant",
      amount: 100,
      balanceAfter: 100,
      reason: "signup_grant",
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runOnce();

    const driftLogs = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("credits ledger mismatch")
    );
    expect(driftLogs).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("detects and logs a real drift between the ledger sum and the stored balance", async () => {
    const org = await Organization.create({ name: "Drifted Org", creditsBalance: 999 });
    await CreditTransaction.create({
      organization: org._id,
      type: "grant",
      amount: 100,
      balanceAfter: 100,
      reason: "signup_grant",
    });
    // creditsBalance (999) now disagrees with the ledger sum (100) — as if
    // something wrote to the balance directly, bypassing the ledger.

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runOnce();

    const driftCall = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("credits ledger mismatch")
    );
    expect(driftCall).toBeDefined();
    expect(String(driftCall?.[1])).toContain(org._id.toString());
    errorSpy.mockRestore();
  });

  it("multiple organizations with no drift and one with drift: only the drifted one is reported", async () => {
    const clean1 = await Organization.create({ name: "Clean 1", creditsBalance: 50 });
    await CreditTransaction.create({
      organization: clean1._id,
      type: "grant",
      amount: 50,
      balanceAfter: 50,
      reason: "signup_grant",
    });
    const clean2 = await Organization.create({ name: "Clean 2", creditsBalance: 0 });
    const drifted = await Organization.create({ name: "Drifted", creditsBalance: 10 });
    await CreditTransaction.create({
      organization: drifted._id,
      type: "grant",
      amount: 5,
      balanceAfter: 5,
      reason: "signup_grant",
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runOnce();

    const driftCall = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("credits ledger mismatch")
    );
    expect(driftCall).toBeDefined();
    const payload = String(driftCall?.[1]);
    expect(payload).toContain(drifted._id.toString());
    expect(payload).not.toContain(clean1._id.toString());
    expect(payload).not.toContain(clean2._id.toString());
    errorSpy.mockRestore();
  });
});
