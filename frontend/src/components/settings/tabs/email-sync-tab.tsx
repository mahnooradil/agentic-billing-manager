"use client";

import * as React from "react";
import { Filter, Loader2, Mail, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SectionHeader } from "@/components/common/section-header";
import { DisconnectDialog } from "@/components/connections/disconnect-dialog";
import { TrackedSendersDialog } from "./email-sync/tracked-senders-dialog";
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
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import { ApiError } from "@/services/api/client";
import { listPlatformConnections, connectViaPipedream } from "@/services/connections/platform-connections.service";
import type { PlatformConnection } from "@/services/types/platform-connections";

type ViewStatus = "loading" | "error" | "ready";

const CACHE_KEY = "email-sync-connections";

/**
 * Email accounts connected for invoice-sync (the Gmail/Outlook fallback
 * behind direct billing sync — see backend/src/services/email-sync). Split
 * out of the Platforms page into its own Settings tab because a single
 * organization can have SEVERAL of these (invoices for different platforms
 * landing in different inboxes) — each is its own connection, distinguished
 * by its real account identity, not a one-per-provider slot.
 */
export function EmailSyncSettingsTab() {
  const cached = readPageCache<PlatformConnection[]>(CACHE_KEY);
  const [status, setStatus] = React.useState<ViewStatus>(cached ? "ready" : "loading");
  const [connections, setConnections] = React.useState<PlatformConnection[]>(cached ?? []);
  const [loadError, setLoadError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [alert, setAlert] = useAlertState();
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = React.useState<PlatformConnection | null>(null);
  const [senderDialogTarget, setSenderDialogTarget] = React.useState<PlatformConnection | null>(
    null
  );

  const reload = () => setReloadKey((key) => key + 1);

  /** Updates one connection in place (list state + cache) — used after saving
   *  tracked senders, so the row reflects the change without a full refetch. */
  const applyConnectionUpdate = (updated: PlatformConnection) => {
    setConnections((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? updated : c));
      writePageCache(CACHE_KEY, next);
      return next;
    });
  };

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await listPlatformConnections();
        if (ignore) return;
        const filtered = res.data.connections.filter((c) => isEmailSyncPlatform(c.platform));
        writePageCache(CACHE_KEY, filtered);
        setConnections(filtered);
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
      // Prompt right away for which senders to watch — the whole point of
      // asking is to avoid a silent whole-inbox scan by default.
      setSenderDialogTarget(res.data.connection);
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
                    <p className="truncate text-xs text-muted-foreground">
                      {connection.trackedSenders.length > 0
                        ? `Watching: ${connection.trackedSenders.join(", ")}`
                        : "Scanning whole inbox"}
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
                    aria-label={`Manage senders for ${emailSyncProviderLabel(connection.platform)}`}
                    onClick={() => setSenderDialogTarget(connection)}
                  >
                    <Filter />
                  </Button>
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

      <TrackedSendersDialog
        open={senderDialogTarget !== null}
        onOpenChange={(open) => !open && setSenderDialogTarget(null)}
        connection={senderDialogTarget}
        onSaved={(updated, message) => {
          applyConnectionUpdate(updated);
          setAlert({ type: "success", message });
        }}
      />
    </div>
  );
}
