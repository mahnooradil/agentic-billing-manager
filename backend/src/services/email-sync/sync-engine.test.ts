import { Types } from "mongoose";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { Billing } from "@/models/billing.model";
import { BillingEvent } from "@/models/billing-event.model";
import { Organization } from "@/models/organization.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { syncConnectionEmail } from "@/services/email-sync/sync-engine";
import type { EmailSyncProvider, NormalizedEmailMessage } from "@/services/email-sync/provider";

vi.mock("@/services/email-sync/provider", async () => {
  const actual = await vi.importActual<typeof import("@/services/email-sync/provider")>(
    "@/services/email-sync/provider"
  );
  return { ...actual, getEmailSyncProvider: vi.fn() };
});

vi.mock("@/services/email-sync/ai-invoice-extractor", async () => {
  const actual = await vi.importActual<typeof import("@/services/email-sync/ai-invoice-extractor")>(
    "@/services/email-sync/ai-invoice-extractor"
  );
  return {
    ...actual,
    isAiExtractionConfigured: vi.fn(() => true),
    extractInvoiceFields: vi.fn(),
  };
});

import { getEmailSyncProvider } from "@/services/email-sync/provider";
import { extractInvoiceFields } from "@/services/email-sync/ai-invoice-extractor";

const AWS_FROM = "AWS Billing <billing@aws.amazon.com>";

/** Builds a minimal fake provider whose `listCandidateMessageIds` returns
 *  exactly the given messages (one page, no pagination) and whose
 *  `getMessage` looks them up by id — enough surface for
 *  syncConnectionEmail's real loop/commit logic to run unmodified, without
 *  touching a real Gmail/Outlook/Pipedream call. */
function fakeProvider(messages: NormalizedEmailMessage[]): EmailSyncProvider {
  const byId = new Map(messages.map((m) => [m.id, m]));
  return {
    dedupePrefix: "gmail",
    notesText: "Synced from Gmail",
    sortedNewestFirstUnfiltered: false,
    buildSearchQuery: () => "q",
    listCandidateMessageIds: async () => ({ messageIds: [...byId.keys()] }),
    getMessage: async (_u, _a, messageId) => byId.get(messageId) ?? null,
  };
}

function message(partial: Partial<NormalizedEmailMessage> & Pick<NormalizedEmailMessage, "id" | "receivedAt">): NormalizedEmailMessage {
  return {
    threadId: null,
    subject: "Invoice",
    plainText: "body",
    fromHeader: AWS_FROM,
    replyToHeader: null,
    authResults: { spf: "pass", dkim: "pass", dmarc: "pass" },
    ...partial,
  };
}

/** Real-DB-backed invoice field extraction stub — keyed by subject so each
 *  mocked message can report a different AI outcome, exactly like a real
 *  extraction call would for a different email. */
function mockExtraction(bySubject: Record<string, { status: "Pending" | "Paid" | "Overdue"; confidence: number }>) {
  vi.mocked(extractInvoiceFields).mockImplementation(async (input) => {
    const outcome = bySubject[input.subject ?? ""];
    return {
      fields: {
        isBillingEmail: true,
        amount: 42,
        currency: "USD",
        invoiceNumber: "INV-100",
        customerName: "AWS",
        billingDate: "2026-01-01",
        dueDate: null,
        status: outcome?.status ?? "Pending",
        confidence: outcome?.confidence ?? 0.9,
      },
      inputTokens: 50,
      outputTokens: 20,
    };
  });
}

/**
 * GM-027, end-to-end through the real syncConnectionEmail pipeline (not just
 * the pure deriveStatus() function — see status-machine.test.ts for that
 * layer). This is what actually proves the narrow cutover (the user's
 * explicit "fix the bug only" scope choice) works through the real commit
 * loop in email-sync/sync-engine.ts, including the manuallyEditedAt guard,
 * the dedupe-by-externalId resolution, and the real Billing/BillingEvent
 * collections — not a mocked model layer.
 */
describe("syncConnectionEmail — GM-027 cutover (real DB, mocked provider + AI extractor only)", () => {
  beforeEach(() => {
    vi.mocked(getEmailSyncProvider).mockReset();
  });

  async function seedOrgAndConnection() {
    const organization = await Organization.create({ name: "Cutover Test Org", creditsBalance: 10_000 });
    const userId = new Types.ObjectId();
    const connection = await PlatformConnection.create({
      organization: organization._id,
      user: userId,
      platform: "gmail",
      accountIdentifier: "owner@example.com",
      displayName: "Gmail",
      status: "connected",
      connectionType: "oauth",
      metadata: { pipedreamAccountId: "apn_test123" },
    });
    return { organization, connection };
  }

  it("a stale reminder synced in a LATER run than its own payment confirmation does not revert Billing.status back to Pending", async () => {
    const { organization, connection } = await seedOrgAndConnection();

    // Run 1: the original invoice, then its payment confirmation — both
    // discovered in the same pass (the common case).
    mockExtraction({
      "Your invoice is ready": { status: "Pending", confidence: 0.9 },
      "Payment received": { status: "Paid", confidence: 0.95 },
    });
    vi.mocked(getEmailSyncProvider).mockReturnValue(
      fakeProvider([
        message({ id: "msg-invoice-1", receivedAt: new Date("2026-01-01"), subject: "Your invoice is ready" }),
        message({ id: "msg-payment-1", receivedAt: new Date("2026-01-05"), subject: "Payment received" }),
      ])
    );

    const freshConnection = await PlatformConnection.findById(connection._id);
    if (!freshConnection) throw new Error("seed failed");
    await syncConnectionEmail(freshConnection);

    const afterRun1 = await Billing.findOne({ organization: organization._id });
    expect(afterRun1?.status).toBe("Paid");
    expect(afterRun1?.derivedStatus).toBe("paid");

    // Run 2: a stale reminder for the SAME invoice (same invoice number →
    // same dedupe key → same Billing row) surfaces late — its own
    // occurredAt (Jan 3) is actually BEFORE the payment confirmation (Jan
    // 5), it just wasn't discovered by the inbox search until this later
    // run. Pre-fix, the naive write directly below would have reverted
    // `status` straight back to "Pending" because it only ever looks at
    // THIS one email — that is the exact confirmed bug (GM-027) this
    // cutover fixes.
    mockExtraction({
      "Reminder: payment due": { status: "Pending", confidence: 0.85 },
    });
    vi.mocked(getEmailSyncProvider).mockReturnValue(
      fakeProvider([
        message({ id: "msg-reminder-1", receivedAt: new Date("2026-01-03"), subject: "Reminder: payment due" }),
      ])
    );

    const connectionForRun2 = await PlatformConnection.findById(connection._id);
    if (!connectionForRun2) throw new Error("seed failed");
    await syncConnectionEmail(connectionForRun2);

    const afterRun2 = await Billing.findOne({ organization: organization._id });
    // The real bug fix: status stays Paid, not reverted to Pending.
    expect(afterRun2?.status).toBe("Paid");
    expect(afterRun2?.derivedStatus).toBe("paid");

    // Exactly one Billing row the whole time — the reminder resolved onto
    // the SAME record via the invoice-number dedupe key, not a new one.
    const allBilling = await Billing.find({ organization: organization._id });
    expect(allBilling).toHaveLength(1);

    const events = await BillingEvent.find({ billing: afterRun2?._id }).sort({ occurredAt: 1 });
    expect(events.map((e) => e.type)).toEqual(["invoice_issued", "reminder", "payment_confirmed"]);
  });

  it("a brand-new invoice whose own due date is already past is written as Overdue on first sync, not Pending (a real improvement, not just a bug fix)", async () => {
    const { organization, connection } = await seedOrgAndConnection();

    // The AI extractor only ever reports "Pending" for a plain invoice with
    // no payment confirmation yet — the OLD naive write copied that
    // verbatim, so a first-ever sync of an old, already-overdue invoice
    // used to sit as "Pending" until some later signal changed it. The
    // cutover's due-date fallback (deriveStatus step 6) catches this
    // immediately instead, since it looks at the real dueDate, not just
    // the single email's own reported status.
    mockExtraction({
      "Old invoice, already overdue": { status: "Pending", confidence: 0.9 },
    });
    vi.mocked(extractInvoiceFields).mockImplementation(async () => ({
      fields: {
        isBillingEmail: true,
        amount: 99,
        currency: "USD",
        invoiceNumber: "INV-OLD-1",
        customerName: "AWS",
        billingDate: "2019-12-01",
        dueDate: "2019-12-15",
        status: "Pending",
        confidence: 0.9,
      },
      inputTokens: 50,
      outputTokens: 20,
    }));
    vi.mocked(getEmailSyncProvider).mockReturnValue(
      fakeProvider([
        message({
          id: "msg-old-1",
          receivedAt: new Date("2020-01-01"),
          subject: "Old invoice, already overdue",
        }),
      ])
    );

    const freshConnection = await PlatformConnection.findById(connection._id);
    if (!freshConnection) throw new Error("seed failed");
    await syncConnectionEmail(freshConnection);

    const billing = await Billing.findOne({ organization: organization._id });
    expect(billing?.status).toBe("Overdue");
    expect(billing?.derivedStatus).toBe("overdue");
  });
});
