"use client";

import * as React from "react";
import { Loader2, Mail, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SectionHeader } from "@/components/common/section-header";
import { DisconnectDialog } from "@/components/connections/disconnect-dialog";
import { cn } from "@/lib/utils";
import {
  EMAIL_SYNC_APPS,
  emailSyncProviderLabel,
  isEmailSyncPlatform,
  lastEmailSyncedAt,
  timeAgo,
} from "@/lib/email-sync-platforms";
import { useAlertState } from "@/hooks/use-alert-state";
import { usePipedreamConnect } from "@/hooks/use-pipedream-connect";
import { ApiError } from "@/services/api/client";
import { listPlatformConnections, connectViaPipedream } from "@/services/connections/platform-connections.service";
import type { PlatformConnection } from "@/services/types/platform-connections";

type ViewStatus = "loading" | "error" | "ready";

/**
 * Email accounts connected for invoice-sync (the Gmail/Outlook fallback
 * behind direct billing sync — see backend/src/services/email-sync). Split
 * out of the Platforms page into its own Settings tab because a single
 * organization can have SEVERAL of these (invoices for different platforms
 * landing in different inboxes) — each is its own connection, distinguished
 * by its real account identity, not a one-per-provider slot.
 */
export function EmailSyncSettingsTab() {
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [connections, setConnections] = React.useState<PlatformConnection[]>([]);
  const [loadError, setLoadError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [alert, setAlert] = useAlertState();
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = React.useState<PlatformConnection | null>(null);

  const reload = () => setReloadKey((key) => key + 1);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await listPlatformConnections();
        if (ignore) return;
        setConnections(res.data.connections.filter((c) => isEmailSyncPlatform(c.platform)));
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Failed to load your email accounts."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const { connectingSlug, connect } = usePipedreamConnect(
    async (app, accountId) => {
      const res = await connectViaPipedream({
        platform: app.nameSlug,
        displayName: app.name,
        accountId,
      });
      setAlert({ type: "success", message: res.message ?? `${app.name} connected.` });
      reload();
    },
    (message) => setActionError(message)
  );

  const handleConnect = (app: (typeof EMAIL_SYNC_APPS)[number]) => {
    setActionError(null);
    void connect(app);
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner label="Loading your email accounts…" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState description={loadError} onRetry={reload} />;
  }

  return (
    <div className="space-y-8">
      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}
      {actionError ? <FormAlert variant="error" message={actionError} /> : null}

      <section className="space-y-4">
        <SectionHeader
          title="Email accounts"
          description="No direct billing sync for a platform? Connect an inbox and we'll scan it for invoice emails automatically — a fallback behind direct sync, not a replacement for it."
        />

        <div className="flex flex-wrap gap-2">
          {EMAIL_SYNC_APPS.map((app) => (
            <Button
              key={app.nameSlug}
              variant="outline"
              size="sm"
              onClick={() => handleConnect(app)}
              disabled={connectingSlug !== null && connectingSlug !== app.nameSlug}
            >
              {connectingSlug === app.nameSlug ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Mail />
              )}
              Connect {app.name}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {connections.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No email accounts connected"
            description="Connect Gmail or Outlook above to start scanning for invoice emails."
          />
        ) : (
          <Card className="divide-y overflow-hidden p-0">
            {connections.map((connection) => {
              const syncedAt = lastEmailSyncedAt(connection.metadata);
              return (
                <div
                  key={connection.id}
                  className="flex items-center gap-3 p-4"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Mail className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {emailSyncProviderLabel(connection.platform)}
                      {connection.accountIdentifier ? ` — ${connection.accountIdentifier}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {connection.status === "connected"
                        ? syncedAt
                          ? `Invoices last checked ${timeAgo(syncedAt)}`
                          : "Connected — first invoice scan pending"
                        : connection.lastError ?? "Needs re-authentication"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      connection.status === "connected" ? "bg-emerald-500" : "bg-red-500"
                    )}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Disconnect ${emailSyncProviderLabel(connection.platform)}`}
                    onClick={() => {
                      setAlert(null);
                      setDisconnectTarget(connection);
                    }}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <DisconnectDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
        connection={disconnectTarget}
        onDisconnected={(message) => {
          setAlert({ type: "success", message });
          setDisconnectTarget(null);
          reload();
        }}
      />
    </div>
  );
}
