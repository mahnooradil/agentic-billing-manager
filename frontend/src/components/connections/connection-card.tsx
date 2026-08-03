"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import { type CardMeta } from "@/lib/platform-catalog";
import type { PlatformConnection } from "@/services/types/platform-connections";

interface ConnectionCardProps {
  meta: CardMeta;
  connection: PlatformConnection | null;
  onConnect: (meta: CardMeta) => void;
  onReconnect: (meta: CardMeta, connection: PlatformConnection) => void;
  onDisconnect: (connection: PlatformConnection) => void;
}

type Visual = { label: string; dotClassName: string; textClassName: string };

/** Real status → plain dot + text. Never "Connected" unless the record truly is. */
function statusVisual(connection: PlatformConnection | null): Visual {
  if (!connection || connection.status === "disconnected") {
    return {
      label: "Not connected",
      dotClassName: "bg-muted-foreground/40",
      textClassName: "text-muted-foreground",
    };
  }
  if (connection.status === "error") {
    return {
      label: "Connection error",
      dotClassName: "bg-red-500",
      textClassName: "text-red-600 dark:text-red-400",
    };
  }
  return {
    label: "Connected",
    dotClassName: "bg-emerald-500",
    textClassName: "text-emerald-700 dark:text-emerald-400",
  };
}

/** A single platform card: icon, name, real status, account, verification, actions. */
export function ConnectionCard({
  meta,
  connection,
  onConnect,
  onReconnect,
  onDisconnect,
}: ConnectionCardProps) {
  const { general } = usePreferences();
  const visual = statusVisual(connection);

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
              meta.badge
            )}
          >
            {meta.monogram}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-tight">
              {connection?.displayName ?? meta.label}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {meta.category === "Custom" ? "Custom platform" : meta.category}
            </p>
          </div>
          <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", visual.textClassName)}>
            <span className={cn("size-1.5 rounded-full", visual.dotClassName)} />
            {visual.label}
          </span>
        </div>

        {connection?.status === "error" && connection.lastError ? (
          <p className="line-clamp-2 text-xs text-red-600 dark:text-red-400">
            {connection.lastError}
          </p>
        ) : connection?.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {connection.description}
          </p>
        ) : null}

        {connection && connection.status !== "disconnected" ? (
          <dl className="mt-auto space-y-1.5 border-t pt-3 text-xs">
            {connection.accountIdentifier ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Account</dt>
                <dd className="min-w-0 truncate font-medium">
                  {connection.accountIdentifier}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {connection.status === "error" ? "Last checked" : "Verified"}
              </dt>
              <dd className="font-medium">
                {connection.lastVerifiedAt
                  ? formatRelativeTime(connection.lastVerifiedAt, general)
                  : connection.hasCredential
                    ? "—"
                    : "Manual"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-auto text-sm text-muted-foreground">
            No connection profile yet.
          </p>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2 border-t pt-3">
        {connection ? (
          <>
            {/* Reconnect only for verifiable (API-key) connections. */}
            {connection.connectionType === "api_key" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReconnect(meta, connection)}
              >
                Reconnect
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDisconnect(connection)}
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onConnect(meta)}>
            Connect
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
