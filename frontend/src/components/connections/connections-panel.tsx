"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SectionHeader } from "@/components/common/section-header";
import { ApiError } from "@/services/api/client";
import { toast } from "@/components/notifications/toast-store";
import { listPlatformConnections } from "@/services/connections/platform-connections.service";
import {
  PLATFORM_CATALOG,
  PLATFORM_CATEGORIES,
  integrationCardMeta,
  type CardMeta,
} from "@/lib/platform-catalog";
import type { PlatformConnection } from "@/services/types/platform-connections";
import { ConnectionCard } from "./connection-card";
import { ConnectApiKeyDialog } from "./connect-api-key-dialog";
import { DisconnectDialog } from "./disconnect-dialog";
import { PipedreamCatalogDialog } from "./pipedream-catalog-dialog";

type ViewStatus = "loading" | "error" | "ready";

/** Built-in providers connectable today (API-key + real verification). OAuth
 *  providers are added in a later step and are intentionally not shown yet. */
const CONNECTABLE = PLATFORM_CATALOG.filter(
  (p) => p.connectionType === "api_key"
);

/**
 * Integrations panel — the real connection experience embedded in the Platforms
 * page. Connect API-key providers (verified against the provider, credential
 * encrypted at rest), reconnect, and disconnect. No fake status: a card reads
 * "Connected" only after verification succeeds.
 */
export function ConnectionsPanel() {
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [connections, setConnections] = React.useState<PlatformConnection[]>([]);
  const [loadError, setLoadError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  const [keyDialog, setKeyDialog] = React.useState<{
    open: boolean;
    meta: CardMeta | null;
    connection: PlatformConnection | null;
  }>({ open: false, meta: null, connection: null });

  const [catalogOpen, setCatalogOpen] = React.useState(false);

  const [disconnect, setDisconnect] = React.useState<{
    open: boolean;
    connection: PlatformConnection | null;
  }>({ open: false, connection: null });

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await listPlatformConnections();
        if (ignore) return;
        setConnections(response.data.connections);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Failed to load integrations."
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

  const byPlatform = React.useMemo(() => {
    const map = new Map<string, PlatformConnection>();
    for (const c of connections) map.set(c.platform, c);
    return map;
  }, [connections]);

  // Pipedream-connected apps: OAuth connections that aren't a built-in card.
  const integrationConnections = React.useMemo(
    () =>
      connections.filter(
        (c) =>
          !c.isCustom &&
          c.connectionType === "oauth" &&
          !CONNECTABLE.some((p) => p.key === c.platform)
      ),
    [connections]
  );

  const handleConnect = (meta: CardMeta) =>
    setKeyDialog({ open: true, meta, connection: null });
  const handleReconnect = (meta: CardMeta, connection: PlatformConnection) =>
    setKeyDialog({ open: true, meta, connection });
  const handleDisconnect = (connection: PlatformConnection) =>
    setDisconnect({ open: true, connection });

  const handleDone = (message: string) => {
    toast.success(message);
    reload();
  };

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Integrations"
        description="Connect any of thousands of platforms via Pipedream, or connect an AI provider with a verified API key. Credentials are encrypted and never shown again."
        actions={
          <Button onClick={() => setCatalogOpen(true)}>
            <Plus />
            Connect a platform
          </Button>
        }
      />

      {status === "loading" ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner label="Loading integrations…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : (
        <div className="space-y-8">
          {/* Built-in API-key providers, grouped by category. */}
          {PLATFORM_CATEGORIES.map((category) => {
            const platforms = CONNECTABLE.filter((p) => p.category === category);
            if (platforms.length === 0) return null;
            return (
              <div key={category} className="space-y-3">
                <h3 className="font-heading text-sm font-semibold text-muted-foreground">
                  {category}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {platforms.map((meta) => (
                    <ConnectionCard
                      key={meta.key}
                      meta={meta}
                      connection={byPlatform.get(meta.key) ?? null}
                      onConnect={handleConnect}
                      onReconnect={handleReconnect}
                      onDisconnect={handleDisconnect}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Pipedream-connected integrations. */}
          {integrationConnections.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-heading text-sm font-semibold text-muted-foreground">
                Connected integrations
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {integrationConnections.map((connection) => (
                  <ConnectionCard
                    key={connection.id}
                    meta={integrationCardMeta(connection)}
                    connection={connection}
                    onConnect={handleConnect}
                    onReconnect={handleReconnect}
                    onDisconnect={handleDisconnect}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {keyDialog.meta ? (
        <ConnectApiKeyDialog
          open={keyDialog.open}
          onOpenChange={(open) => setKeyDialog((state) => ({ ...state, open }))}
          platform={keyDialog.meta}
          connection={keyDialog.connection}
          onDone={handleDone}
        />
      ) : null}

      <PipedreamCatalogDialog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        onConnected={handleDone}
      />

      <DisconnectDialog
        open={disconnect.open}
        onOpenChange={(open) => setDisconnect((state) => ({ ...state, open }))}
        connection={disconnect.connection}
        onDisconnected={handleDone}
      />
    </section>
  );
}
