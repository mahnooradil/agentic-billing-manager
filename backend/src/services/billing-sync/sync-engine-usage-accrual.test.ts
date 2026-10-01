import { Types } from "mongoose";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { connectProxyRequestMock } = vi.hoisted(() => ({
  connectProxyRequestMock: vi.fn(),
}));
vi.mock("@/services/integrations/pipedream", () => ({
  connectProxyRequest: connectProxyRequestMock,
}));

// Hoisted above these imports by vitest, so both adapters below use the
// mocked proxy.
import { PlatformConnection } from "@/models/platform-connection.model";
import { Billing } from "@/models/billing.model";
import { UsageAccrual } from "@/models/usage-accrual.model";
import { syncConnectionBilling } from "@/services/billing-sync/sync-engine";

async function createConnection(platform: string) {
  return PlatformConnection.create({
    organization: new Types.ObjectId(),
    user: new Types.ObjectId(),
    platform,
    accountIdentifier: `${platform}-account`,
    displayName: platform,
    status: "connected",
    connectionType: "oauth",
    metadata: { pipedreamAccountId: "acc_test" },
  });
}

describe("syncConnectionBilling routes by adapter kind (WP-4)", () => {
  beforeEach(() => {
    connectProxyRequestMock.mockReset();
  });

  it("a usage_accrual adapter (vultr) writes to UsageAccrual, never to Billing", async () => {
    connectProxyRequestMock.mockResolvedValue({
      account: { balance: -12.5, pending_charges: 12.5 },
    });
    const connection = await createConnection("vultr");

    await syncConnectionBilling(connection);

    const usageRows = await UsageAccrual.find({ platformConnection: connection._id });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]?.amount).toBe(12.5);

    const billingRows = await Billing.find({ platformConnection: connection._id });
    expect(billingRows).toHaveLength(0);
  });

  it("an invoice adapter (heroku) writes to Billing, never to UsageAccrual", async () => {
    connectProxyRequestMock.mockResolvedValue([
      { id: "inv_1", number: 42, total: 1500, state: 2, period_end: "2026-09-01" },
    ]);
    const connection = await createConnection("heroku");

    await syncConnectionBilling(connection);

    const billingRows = await Billing.find({ platformConnection: connection._id });
    expect(billingRows).toHaveLength(1);
    expect(billingRows[0]?.status).toBe("Paid");
    expect(billingRows[0]?.source).toBe("auto_sync");

    const usageRows = await UsageAccrual.find({ platformConnection: connection._id });
    expect(usageRows).toHaveLength(0);
  });

  it("re-syncing a usage_accrual connection updates the same row instead of duplicating it", async () => {
    const connection = await createConnection("vultr");

    connectProxyRequestMock.mockResolvedValue({ account: { pending_charges: 10 } });
    await syncConnectionBilling(connection);

    connectProxyRequestMock.mockResolvedValue({ account: { pending_charges: 25 } });
    await syncConnectionBilling(connection);

    const usageRows = await UsageAccrual.find({ platformConnection: connection._id });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]?.amount).toBe(25);
  });
});
