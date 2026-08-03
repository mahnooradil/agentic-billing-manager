/**
 * SignalWire billing adapter.
 *
 * SignalWire's REST API is Twilio-API-compatible, so this mirrors the
 * GitHub/Twilio 2-step pattern: `GET /api/laml/2010-04-01/Accounts.json`
 * (self-scoped) discovers the connected account's own sid, then
 * `GET /Accounts/{sid}/Balance.json` returns its current balance.
 */
import { connectProxyRequest } from "@/services/integrations/pipedream";
import type { BillingSyncAdapter, NormalizedBillingRecord } from "@/services/billing-sync/types";

interface SignalWireAccount {
  sid?: string;
}

interface SignalWireAccountsResponse {
  accounts?: SignalWireAccount[];
}

interface SignalWireBalanceResponse {
  balance?: string;
  currency?: string;
}

export const signalwireBillingAdapter: BillingSyncAdapter = {
  platform: "signalwire",
  label: "SignalWire",

  async fetchRecords(
    externalUserId,
    pipedreamAccountId
  ): Promise<NormalizedBillingRecord[]> {
    const accounts = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      "https://api.signalwire.com/api/laml/2010-04-01/Accounts.json"
    )) as SignalWireAccountsResponse | null;

    const sid = accounts?.accounts?.[0]?.sid;
    if (!sid) return [];

    const balance = (await connectProxyRequest(
      externalUserId,
      pipedreamAccountId,
      `https://api.signalwire.com/api/laml/2010-04-01/Accounts/${sid}/Balance.json`
    )) as SignalWireBalanceResponse | null;

    const amount = Number(balance?.balance);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    return [
      {
        externalId: `signalwire-${day}`,
        amount,
        currency: (balance?.currency ?? "USD").toUpperCase(),
        billingDate: now,
        status: "Pending",
        notes: "Auto-synced from SignalWire — account balance.",
      },
    ];
  },
};
