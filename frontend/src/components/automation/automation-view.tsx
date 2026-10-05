"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Workflow, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { isEmailSyncPlatform, lastEmailSyncedAt } from "@/lib/email-sync-platforms";
import { useAlertState } from "@/hooks/use-alert-state";
import { usePreferences } from "@/services/preferences/preferences-store";
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import { ApiError } from "@/services/api/client";
import {
  listPlatformConnections,
  updatePlatformConnection,
} from "@/services/connections/platform-connections.service";
import {
  SYNC_INTERVAL_OPTIONS_MINUTES,
  type PlatformConnection,
  type SyncIntervalMinutes,
} from "@/services/types/platform-connections";
import { DisconnectDialog } from "@/components/connections/disconnect-dialog";

type ViewStatus = "loading" | "error" | "ready";

const CACHE_KEY = "automation";
const DEFAULT_EMAIL_SYNC_MINUTES: SyncIntervalMinutes = 60;
const DEFAULT_BILLING_SYNC_MINUTES: SyncIntervalMinutes = 360;

/** "Every 15 minutes" / "Every hour" / "Daily" — mirrors the backend's own
 *  allowed options exactly (SYNC_INTERVAL_OPTIONS_MINUTES). */
function intervalLabel(minutes: SyncIntervalMinutes): string {
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes === 60) return "Every hour";
  if (minutes < 1440) return `Every ${minutes / 60} hours`;
  return "Daily";
}

const INTERVAL_ITEMS = SYNC_INTERVAL_OPTIONS_MINUTES.map((minutes) => ({
  value: String(minutes),
  label: intervalLabel(minutes),
}));

interface SyncRow {
  connection: PlatformConnection;
  isEmailSync: boolean;
  effectiveIntervalMinutes: SyncIntervalMinutes;
  scheduleLabel: string;
  lastRunIso: string | null;
  nextRunIso: string | null;
  /** True when the most recent SYNC RUN itself failed — distinct from
   *  `connection.status === "error"` (the credential's own health). A
   *  connection can be perfectly "connected" while its last sync still
   *  failed (an AI-extractor outage, a transient provider error, etc.). */
  syncFailed: boolean;
  syncErrorMessage: string | null;
  invoicesFound: number | null;
  messagesScanned: number | null;
}

function buildRow(connection: PlatformConnection): SyncRow {
  const isEmailSync = isEmailSyncPlatform(connection.platform);
  const defaultMinutes = isEmailSync ? DEFAULT_EMAIL_SYNC_MINUTES : DEFAULT_BILLING_SYNC_MINUTES;
  const effectiveIntervalMinutes = connection.syncIntervalMinutes ?? defaultMinutes;
  const intervalMs = effectiveIntervalMinutes * 60_000;
  // Prefer the real lastSyncAt (S-17 fix) — a run's own recorded completion
  // time. Falls back to the older inferred signals only for a connection
  // that hasn't completed a sync since that field started being written.
  const lastRun = connection.lastSyncAt
    ? new Date(connection.lastSyncAt)
    : isEmailSync
      ? lastEmailSyncedAt(connection.metadata)
      : connection.lastVerifiedAt
        ? new Date(connection.lastVerifiedAt)
        : new Date(connection.updatedAt);
  const nextRun =
    connection.status === "connected" && lastRun
      ? new Date(lastRun.getTime() + intervalMs)
      : null;

  return {
    connection,
    isEmailSync,
    effectiveIntervalMinutes,
    scheduleLabel: intervalLabel(effectiveIntervalMinutes),
    lastRunIso: lastRun ? lastRun.toISOString() : null,
    nextRunIso: nextRun ? nextRun.toISOString() : null,
    syncFailed: connection.lastSyncStatus === "error",
    syncErrorMessage: connection.lastSyncError,
    invoicesFound: connection.invoicesFound,
    messagesScanned: connection.messagesScanned,
  };
}

/** Coarse "in ~Xh" label for a future timestamp — a status hint, not a countdown. */
function inLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "Due now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `In ${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `In ${hours}h`;
}

function StatusPill({ status }: { status: PlatformConnection["status"] }) {
  const label = status === "connected" ? "Active" : status === "error" ? "Error" : "Paused";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        status === "error" ? "text-destructive" : "text-foreground"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "connected"
            ? "bg-primary"
            : status === "error"
              ? "bg-destructive"
              : "bg-muted-foreground/50"
        )}
      />
      {label}
    </span>
  );
}

/**
 * Automation: visibility into every platform's autonomous sync job — the
 * billing-sync adapters and the Gmail/Outlook email-sync fallback that pull
 * new invoices in without anyone opening the Platforms page. A clean table,
 * not a dashboard of cards: name, status, schedule, last run, next run,
 * actions — exactly what's actually scheduled, no more.
 */
export function AutomationView() {
  const router = useRouter();
  const { general } = usePreferences();
  const cached = readPageCache<PlatformConnection[]>(CACHE_KEY);
  const [status, setStatus] = React.useState<ViewStatus>(cached ? "ready" : "loading");
  const [connections, setConnections] = React.useState<PlatformConnection[]>(cached ?? []);
  const [loadError, setLoadError] = React.useState("");
  const [alert, setAlert] = useAlertState();
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  const [disconnect, setDisconnect] = React.useState<{
    open: boolean;
    connection: PlatformConnection | null;
  }>({ open: false, connection: null });
  const [savingIntervalId, setSavingIntervalId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await listPlatformConnections();
        if (ignore) return;
        writePageCache(CACHE_KEY, response.data.connections);
        setConnections(response.data.connections);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Failed to load automation status."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setStatus("loading");
    reload();
  };

  // Only OAuth-connected platforms run on an automatic schedule — API-key /
  // manual connections have no recurring job to report here.
  const rows = React.useMemo(
    () =>
      connections
        .filter((c) => c.connectionType === "oauth")
        .map(buildRow)
        .sort((a, b) => a.connection.displayName.localeCompare(b.connection.displayName)),
    [connections]
  );

  const openDisconnect = (connection: PlatformConnection) => {
    setAlert(null);
    setDisconnect({ open: true, connection });
  };

  const handleDisconnected = (message: string) => {
    setAlert({ type: "success", message });
    reload();
  };

  // Soft-updates the one row in place rather than a full reload — matches
  // the pattern used across the app (vendor confirm/reject, sender
  // restore/mute) for an action that only ever changes itself.
  const handleIntervalChange = async (connectionId: string, minutes: SyncIntervalMinutes) => {
    setSavingIntervalId(connectionId);
    setAlert(null);
    try {
      const res = await updatePlatformConnection(connectionId, { syncIntervalMinutes: minutes });
      setConnections((prev) =>
        prev.map((c) => (c.id === connectionId ? res.data.connection : c))
      );
    } catch (error) {
      setAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Could not update the sync schedule.",
      });
    } finally {
      setSavingIntervalId(null);
    }
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Automation"
        description="Every platform syncing your billing data on its own — no manual imports."
      />

      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}

      {status === "loading" && connections.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <LoadingSpinner label="Loading automation status…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="Nothing running yet"
          description="Connect a platform to turn on automatic billing sync — no scheduled jobs exist until then."
          action={
            <Button onClick={() => router.push("/dashboard/platforms")}>
              <ArrowRight />
              Go to Platforms
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Schedule</th>
                  <th className="px-5 py-3 font-medium">Last run</th>
                  <th className="px-5 py-3 font-medium">Next run</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.connection.id}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-foreground">{row.connection.displayName}</p>
                      {row.connection.accountIdentifier ? (
                        <p className="text-xs text-muted-foreground">
                          {row.connection.accountIdentifier}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill status={row.connection.status} />
                      {row.syncFailed ? (
                        <p className="mt-0.5 text-xs text-destructive">
                          {row.syncErrorMessage ?? "Last sync failed"}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      <Select
                        items={INTERVAL_ITEMS}
                        value={String(row.effectiveIntervalMinutes)}
                        onValueChange={(value) =>
                          void handleIntervalChange(
                            row.connection.id,
                            Number(value) as SyncIntervalMinutes
                          )
                        }
                        disabled={savingIntervalId !== null}
                      >
                        <SelectTrigger size="sm" className="w-36" aria-label="Sync schedule">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYNC_INTERVAL_OPTIONS_MINUTES.map((minutes) => (
                            <SelectItem key={minutes} value={String(minutes)}>
                              {intervalLabel(minutes)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {row.lastRunIso ? formatRelativeTime(row.lastRunIso, general) : "—"}
                      {row.invoicesFound !== null ? (
                        <p className="text-xs">
                          {row.invoicesFound} invoice{row.invoicesFound === 1 ? "" : "s"} found
                          {row.messagesScanned !== null
                            ? ` · ${row.messagesScanned} scanned`
                            : ""}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {row.nextRunIso ? inLabel(row.nextRunIso) : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        {row.connection.status === "error" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push("/dashboard/platforms")}
                          >
                            Reconnect
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openDisconnect(row.connection)}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DisconnectDialog
        open={disconnect.open}
        onOpenChange={(open) => setDisconnect((state) => ({ ...state, open }))}
        connection={disconnect.connection}
        onDisconnected={handleDisconnected}
      />
    </PageWrapper>
  );
}
