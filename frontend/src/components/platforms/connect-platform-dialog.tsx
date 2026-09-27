"use client";

import * as React from "react";
import { Plug, Search, SearchX, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PlatformLogo } from "@/components/platforms/platform-logo";
import { usePipedreamConnect } from "@/hooks/use-pipedream-connect";
import { ApiError } from "@/services/api/client";
import {
  connectViaPipedream,
  getPipedreamCatalog,
} from "@/services/connections/platform-connections.service";
import type { CatalogApp } from "@/services/types/platform-connections";

type ViewStatus = "loading" | "error" | "ready";

const CATALOG_LIMIT = 100;

interface ConnectPlatformDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Platform slugs already connected — excluded from the catalog list. */
  connectedSlugs: Set<string>;
  onConnected: (message: string) => void;
}

/**
 * The catalog-browsing / search flow, moved out of the main Platforms page
 * (which is now a direct, connection-status-first view) and into an
 * on-demand dialog — the capability to connect a NEW platform isn't lost,
 * it's just not the page's primary content anymore.
 */
export function ConnectPlatformDialog({
  open,
  onOpenChange,
  connectedSlugs,
  onConnected,
}: ConnectPlatformDialogProps) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [apps, setApps] = React.useState<CatalogApp[]>([]);
  const [configured, setConfigured] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  const { connectingSlug: connecting, connect } = usePipedreamConnect(
    async (app, accountId) => {
      const res = await connectViaPipedream({
        platform: app.nameSlug,
        displayName: app.name,
        accountId,
      });
      onConnected(res.message ?? `${app.name} connected.`);
      onOpenChange(false);
    },
    (message) => setActionError(message)
  );

  React.useEffect(() => {
    if (!open) return;
    let ignore = false;
    const timer = setTimeout(
      async () => {
        setStatus("loading");
        try {
          const res = await getPipedreamCatalog(query, CATALOG_LIMIT);
          if (ignore) return;
          setConfigured(res.data.configured);
          setApps(res.data.apps);
          setStatus("ready");
        } catch (error) {
          if (ignore) return;
          setLoadError(
            error instanceof ApiError ? error.message : "Failed to load platforms."
          );
          setStatus("error");
        }
      },
      query ? 300 : 0
    );
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  // Reset the search box each time the dialog re-opens — adjusted during
  // render (per React's guidance for state that depends on a changing prop),
  // not in an effect, since two setState calls there would cascade.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActionError(null);
    }
  }

  const browseApps = apps.filter((app) => !connectedSlugs.has(app.nameSlug));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect a platform</DialogTitle>
          <DialogDescription>
            Only platforms with real, automatic billing sync are listed — no dead-end
            connections.
          </DialogDescription>
        </DialogHeader>

        {actionError ? <FormAlert variant="error" message={actionError} /> : null}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — Stripe, GitHub, PayPal, DigitalOcean…"
            className="pl-8"
            aria-label="Search platforms"
            autoFocus
          />
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {status === "loading" && apps.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner label="Loading platforms…" />
            </div>
          ) : status === "error" ? (
            <ErrorState description={loadError} />
          ) : !configured ? (
            <EmptyState
              title="Pipedream isn't connected"
              description="This server doesn't have Pipedream configured yet."
            />
          ) : browseApps.length === 0 ? (
            <EmptyState icon={SearchX} title="No matching platforms" />
          ) : (
            browseApps.map((app) => (
              <Card key={app.id} className="flex flex-row items-center gap-3 p-3">
                <PlatformLogo src={app.imgSrc} name={app.name} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{app.name}</p>
                  {app.description ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {app.description}
                    </p>
                  ) : null}
                </div>
                <Button size="sm" variant="outline" onClick={() => void connect(app)}>
                  {connecting === app.nameSlug ? (
                    <>
                      <X />
                      Cancel
                    </>
                  ) : (
                    <>
                      <Plug />
                      Connect
                    </>
                  )}
                </Button>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
