"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Boxes, Filter, Mail, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { cn } from "@/lib/utils";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import {
  EMAIL_SYNC_APPS,
  emailSyncProviderLabel,
  isEmailSyncPlatform,
} from "@/lib/email-sync-platforms";
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import { useAlertState } from "@/hooks/use-alert-state";
import { usePipedreamConnect, type PipedreamConnectTarget } from "@/hooks/use-pipedream-connect";
import { ApiError } from "@/services/api/client";
import {
  getPipedreamCatalog,
  listPlatformConnections,
  connectViaPipedream,
} from "@/services/connections/platform-connections.service";
import { listBillingRecords } from "@/services/billing/billing.service";
import { listUsageAccruals } from "@/services/connections/usage-accrual.service";
import type { PlatformConnection } from "@/services/types/platform-connections";
import type { BillingRecord } from "@/services/types/billing";
import type { UsageAccrual } from "@/services/types/usage-accrual";
import { PlatformLogo } from "@/components/platforms/platform-logo";
import { ConnectPlatformDialog } from "@/components/platforms/connect-platform-dialog";
import { EmailPrivacyConsentDialog } from "@/components/platforms/email-privacy-consent-dialog";
import { TrackedSendersDialog } from "@/components/platforms/tracked-senders-dialog";
import { DisconnectDialog } from "@/components/connections/disconnect-dialog";

type ViewStatus = "loading" | "error" | "ready";

const CACHE_KEY = "platforms";
interface PlatformsCachePayload {
  connections: PlatformConnection[];
  billingRecords: BillingRecord[];
  usageAccruals: UsageAccrual[];
}

interface ConnectedPlatformRow {
  key: string;
  label: string;
  accountCount: number;
}

/**
 * Platforms screen: a direct, connection-status-first view (no search-first
 * catalog browsing as the main content — that flow now lives behind the
 * "Connect a platform" button, in `ConnectPlatformDialog`).
 *
 * Section order: Connected Platforms → Connected Gmail/Outlook accounts,
 * each with the real vendors (Netflix, AWS, …) whose invoices have actually
 * been found in that inbox — derived from Billing records' `source` +
 * `platformConnection` link, not static/mock data.
 *
 * Wrapped in Suspense because the inner component reads `useSearchParams()`
 * (deep-link support for the AI Assistant's "Connect now" button).
 */
export function PlatformsView() {
  return (
    <React.Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center py-16">
          <LoadingSpinner label="Loading platforms…" />
        </div>
      }
    >
      <PlatformsViewInner />
    </React.Suspense>
  );
}

function PlatformsViewInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { general } = usePreferences();

  const cached = readPageCache<PlatformsCachePayload>(CACHE_KEY);
  const [status, setStatus] = React.useState<ViewStatus>(cached ? "ready" : "loading");
  const [connections, setConnections] = React.useState<PlatformConnection[]>(
    cached?.connections ?? []
  );
  const [billingRecords, setBillingRecords] = React.useState<BillingRecord[]>(
    cached?.billingRecords ?? []
  );
  const [usageAccruals, setUsageAccruals] = React.useState<UsageAccrual[]>(
    cached?.usageAccruals ?? []
  );
  const [loadError, setLoadError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  const [alert, setAlert] = useAlertState();
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [disconnect, setDisconnect] = React.useState<{
    open: boolean;
    connection: PlatformConnection | null;
  }>({ open: false, connection: null });
  const [senderDialogTarget, setSenderDialogTarget] = React.useState<PlatformConnection | null>(
    null
  );
  // WP-12 — the "Connect Gmail"/"Connect Outlook" buttons open this first;
  // the real Pipedream popup only opens once the user confirms here. Scoped
  // to these two explicit buttons only — the agent-chat deep-link flow below
  // already arrives with its own explanatory context from the agent's own
  // reply, so it isn't re-gated behind a second confirmation here.
  const [emailConsentTarget, setEmailConsentTarget] =
    React.useState<PipedreamConnectTarget | null>(null);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      if (!readPageCache<PlatformsCachePayload>(CACHE_KEY)) setStatus("loading");
      try {
        const [connectionsRes, billingRes, usageRes] = await Promise.all([
          listPlatformConnections(),
          listBillingRecords(),
          listUsageAccruals(),
        ]);
        if (ignore) return;
        const payload: PlatformsCachePayload = {
          connections: connectionsRes.data.connections,
          billingRecords: billingRes.data.billingRecords,
          usageAccruals: usageRes.data.accruals,
        };
        writePageCache(CACHE_KEY, payload);
        setConnections(payload.connections);
        setBillingRecords(payload.billingRecords);
        setUsageAccruals(payload.usageAccruals);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Failed to load platforms."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  // Shared connect flow for anything triggered directly from this page (not
  // through ConnectPlatformDialog's own instance): the deep-link below, and
  // the "Connect Gmail"/"Connect Outlook" buttons. A freshly-connected email
  // account gets prompted right away for which senders to watch — the whole
  // point of asking is to avoid a silent whole-inbox scan by default.
  const { connectingSlug: connectingEmailApp, connect } = usePipedreamConnect(
    async (app, accountId) => {
      const res = await connectViaPipedream({
        platform: app.nameSlug,
        displayName: app.name,
        accountId,
      });
      setAlert({ type: "success", message: res.message ?? `${app.name} connected.` });
      reload();
      if (isEmailSyncPlatform(app.nameSlug)) setSenderDialogTarget(res.data.connection);
    },
    (message) => setAlert({ type: "error", message })
  );
  const connectParam = searchParams.get("connect");
  const deepLinkHandledRef = React.useRef(false);
  React.useEffect(() => {
    if (!connectParam || deepLinkHandledRef.current) return;
    deepLinkHandledRef.current = true;
    router.replace(pathname, { scroll: false });
    (async () => {
      try {
        const res = await getPipedreamCatalog(connectParam, 5);
        const target = res.data.apps.find(
          (app) => app.nameSlug.toLowerCase() === connectParam.toLowerCase()
        );
        if (target) void connect(target);
      } catch {
        // Silent — the user can still connect manually via the dialog.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectParam]);

  const retry = () => {
    setStatus("loading");
    reload();
  };

  // "Connected Platforms" — one row per distinct connected platform,
  // whether that's an email provider (Gmail/Outlook) or a direct
  // billing-sync connection (Stripe, PayPal, …).
  const connectedPlatformRows = React.useMemo<ConnectedPlatformRow[]>(() => {
    const map = new Map<string, ConnectedPlatformRow>();
    for (const c of connections) {
      if (c.status !== "connected") continue;
      const key = c.platform.toLowerCase();
      const label = isEmailSyncPlatform(c.platform)
        ? emailSyncProviderLabel(c.platform)
        : c.displayName;
      const existing = map.get(key);
      if (existing) existing.accountCount += 1;
      else map.set(key, { key, label, accountCount: 1 });
    }
    return Array.from(map.values());
  }, [connections]);

  // Email-sync connections, grouped by provider (Gmail / Outlook) — each
  // provider gets its own "Connected <Provider> accounts" section below.
  const emailProviderGroups = React.useMemo(() => {
    const groups = new Map<string, PlatformConnection[]>();
    for (const c of connections) {
      if (!isEmailSyncPlatform(c.platform)) continue;
      const key = c.platform.toLowerCase();
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([key, list]) => ({
      key,
      label: emailSyncProviderLabel(key),
      connections: list,
    }));
  }, [connections]);

  // Every email provider with zero connected accounts — always offered,
  // regardless of whether a DIFFERENT provider already has one (e.g. Gmail
  // connected shouldn't hide the still-unconnected Outlook button).
  const unconnectedEmailApps = React.useMemo(
    () =>
      EMAIL_SYNC_APPS.filter(
        (app) => !emailProviderGroups.some((group) => group.key === app.nameSlug)
      ),
    [emailProviderGroups]
  );

  // Real vendors (Netflix, AWS, …) whose invoices were actually found in
  // each specific inbox — derived from Billing records, never mock data.
  // For an email-sync record, the serializer puts the connection's id in
  // `platform.id` and the detected vendor name in `platform.name`.
  const syncedVendorsByConnection = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const record of billingRecords) {
      if (record.source !== "email_sync") continue;
      const set = map.get(record.platform.id) ?? new Set<string>();
      set.add(record.platform.name);
      map.set(record.platform.id, set);
    }
    return map;
  }, [billingRecords]);

  const openDisconnect = (connection: PlatformConnection) => {
    setAlert(null);
    setDisconnect({ open: true, connection });
  };
  const handleDisconnected = (message: string) => {
    setAlert({ type: "success", message });
    reload();
  };
  const handleConnectEmail = (app: (typeof EMAIL_SYNC_APPS)[number]) => {
    setAlert(null);
    setEmailConsentTarget(app);
  };
  const handleEmailConsentContinue = () => {
    const target = emailConsentTarget;
    setEmailConsentTarget(null);
    if (target) void connect(target);
  };
  const handleSendersSaved = (message: string) => {
    setAlert({ type: "success", message });
    reload();
  };
  const handleConnected = (message: string) => {
    setAlert({ type: "success", message });
    reload();
  };

  const connectedSlugs = new Set(connections.map((c) => c.platform.toLowerCase()));
  const nothingConnected =
    connectedPlatformRows.length === 0 && emailProviderGroups.length === 0;

  return (
    <PageWrapper>
      <PageHeader
        title="Platforms"
        description="Where your billing data comes from — connected platforms, and the email accounts syncing invoices automatically."
        actions={
          <Button onClick={() => setConnectOpen(true)}>
            <Plus />
            Connect a platform
          </Button>
        }
      />

      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}

      {status === "loading" && connections.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <LoadingSpinner label="Loading platforms…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : nothingConnected ? (
        <EmptyState
          icon={Boxes}
          title="Nothing connected yet"
          description="Connect a platform directly, or connect Gmail/Outlook to scan for invoice emails automatically."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setConnectOpen(true)}>
                <Plus />
                Connect a platform
              </Button>
              {EMAIL_SYNC_APPS.map((app) => (
                <Button
                  key={app.nameSlug}
                  variant="outline"
                  onClick={() => handleConnectEmail(app)}
                  disabled={connectingEmailApp !== null && connectingEmailApp !== app.nameSlug}
                >
                  <Mail />
                  Connect {app.name}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <SectionHeader title="Connected Platforms" />
            <Card className="divide-y overflow-hidden p-0">
              {connectedPlatformRows.map((row) => (
                <div key={row.key} className="flex items-center gap-3 px-5 py-3.5">
                  <PlatformLogo src={null} name={row.label} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                    {row.accountCount > 1 ? (
                      <p className="text-xs text-muted-foreground">
                        {row.accountCount} accounts connected
                      </p>
                    ) : null}
                  </div>
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                </div>
              ))}
            </Card>
          </section>

          {usageAccruals.length > 0 ? (
            <section className="space-y-3">
              <SectionHeader
                title="Usage & balances"
                description="Month-to-date usage or account balance from your connected platforms — not an invoice, and never counted toward outstanding or overdue."
              />
              <Card className="divide-y overflow-hidden p-0">
                {usageAccruals.map((accrual) => (
                  <div key={accrual.id} className="flex items-center gap-3 px-5 py-3.5">
                    <PlatformLogo
                      src={null}
                      name={accrual.connection.displayName}
                      className="size-9"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {accrual.connection.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated {formatRelativeTime(accrual.snapshotAt, general)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatMoney(accrual.amount, accrual.currency, general)}
                    </span>
                  </div>
                ))}
              </Card>
            </section>
          ) : null}

          {emailProviderGroups.length === 0 ? (
            <section className="space-y-3">
              <SectionHeader title="Connected Gmail accounts" />
              <EmptyState
                icon={Mail}
                title="No email accounts connected"
                description="Connect Gmail or Outlook to scan for invoice emails automatically — a fallback behind direct platform sync."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {EMAIL_SYNC_APPS.map((app) => (
                      <Button
                        key={app.nameSlug}
                        variant="outline"
                        onClick={() => handleConnectEmail(app)}
                        disabled={
                          connectingEmailApp !== null && connectingEmailApp !== app.nameSlug
                        }
                      >
                        <Mail />
                        Connect {app.name}
                      </Button>
                    ))}
                  </div>
                }
              />
            </section>
          ) : (
            emailProviderGroups.map((group) => {
              const app = EMAIL_SYNC_APPS.find((a) => a.nameSlug === group.key);
              return (
              <section key={group.key} className="space-y-3">
                <SectionHeader
                  title={`Connected ${group.label} accounts`}
                  actions={
                    app ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConnectEmail(app)}
                        disabled={connectingEmailApp !== null}
                      >
                        <Plus />
                        Connect another
                      </Button>
                    ) : undefined
                  }
                />
                <div className="space-y-3">
                  {group.connections.map((connection) => {
                    const vendors = Array.from(
                      syncedVendorsByConnection.get(connection.id) ?? []
                    ).sort((a, b) => a.localeCompare(b));
                    return (
                      <Card key={connection.id} className="p-4">
                        <div className="flex items-center gap-3">
                          <PlatformLogo
                            src={null}
                            name={connection.accountIdentifier || connection.displayName}
                            className="size-9"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {connection.accountIdentifier || connection.displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {connection.status === "connected"
                                ? "Connected · Synchronization active"
                                : connection.lastError ?? "Needs re-authentication"}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              connection.status === "connected"
                                ? "bg-primary"
                                : "bg-destructive"
                            )}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Manage senders for ${connection.accountIdentifier || connection.displayName}`}
                            title="Manage which senders are watched"
                            onClick={() => setSenderDialogTarget(connection)}
                          >
                            <Filter />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openDisconnect(connection)}
                          >
                            Disconnect
                          </Button>
                        </div>
                        <div className="mt-3 border-t pt-3">
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                            Synchronized platforms
                          </p>
                          {vendors.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No invoices synced from this inbox yet.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {vendors.map((vendor) => (
                                <span
                                  key={vendor}
                                  className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                                >
                                  {vendor}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
              );
            })
          )}

          {emailProviderGroups.length > 0
            ? unconnectedEmailApps.map((app) => (
                <section key={app.nameSlug} className="space-y-3">
                  <SectionHeader
                    title={`Connected ${app.name} accounts`}
                    actions={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConnectEmail(app)}
                        disabled={connectingEmailApp !== null}
                      >
                        <Mail />
                        Connect
                      </Button>
                    }
                  />
                  <Card className="flex flex-row items-center gap-3 px-5 py-4">
                    <PlatformLogo src={null} name={app.name} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">Not connected</p>
                      <p className="text-xs text-muted-foreground">
                        Connect to scan for invoice emails automatically.
                      </p>
                    </div>
                  </Card>
                </section>
              ))
            : null}
        </div>
      )}

      <ConnectPlatformDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        connectedSlugs={connectedSlugs}
        onConnected={handleConnected}
      />
      <TrackedSendersDialog
        open={senderDialogTarget !== null}
        onOpenChange={(open) => !open && setSenderDialogTarget(null)}
        connection={senderDialogTarget}
        onSaved={(_updated, message) => handleSendersSaved(message)}
      />
      <DisconnectDialog
        open={disconnect.open}
        onOpenChange={(open) => setDisconnect((state) => ({ ...state, open }))}
        connection={disconnect.connection}
        onDisconnected={handleDisconnected}
      />
      <EmailPrivacyConsentDialog
        app={emailConsentTarget}
        open={emailConsentTarget !== null}
        onOpenChange={(open) => !open && setEmailConsentTarget(null)}
        onContinue={handleEmailConsentContinue}
      />
    </PageWrapper>
  );
}
