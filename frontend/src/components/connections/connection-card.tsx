"use client";

import {
  Plug,
  Unplug,
  RefreshCw,
  CircleCheck,
  CircleSlash,
  TriangleAlert,
} from "lucide-react";

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

type Visual = {
  label: string;
  className: string;
  icon: typeof CircleCheck;
};

/** Real status → badge. Never "Connected" unless the record truly is. */
function statusVisual(connection: PlatformConnection | null): Visual {
  if (!connection || connection.status === "disconnected") {
    return {
      label: "Not connected",
      className: "border-dashed border-border bg-muted/40 text-muted-foreground",
      icon: CircleSlash,
    };
  }
  if (connection.status === "error") {
    return {
      label: "Connection error",
      className: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
      icon: TriangleAlert,
    };
  }
  return {
    label: "Connected",
    className:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: CircleCheck,
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
  const isConnected = connection !== null && connection.status !== "disconnected";
  const visual = statusVisual(connection);
  const StatusIcon = visual.icon;

  return (
    <Card
      className={cn(
        "hover-lift group flex flex-col",
        isConnected ? "border-border" : "border-dashed"
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold tracking-tight",
              meta.badge
            )}
          >
            {meta.monogram}
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <h3 className="truncate font-heading text-base font-semibold leading-tight">
              {connection?.displayName ?? meta.label}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {meta.category === "Custom" ? "Custom platform" : meta.category}
            </p>
          </div>
          <span
            className={cn(
              "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              visual.className
            )}
          >
            <StatusIcon className="size-3.5" />
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
          <dl className="mt-auto space-y-2 border-t pt-3 text-xs">
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

      <CardFooter className="justify-end gap-2 border-t pt-4">
        {connection ? (
          <>
            {/* Reconnect only for verifiable (API-key) connections. */}
            {connection.connectionType === "api_key" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReconnect(meta, connection)}
              >
                <RefreshCw />
                Reconnect
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDisconnect(connection)}
            >
              <Unplug />
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => onConnect(meta)}>
            <Plug />
            Connect
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
