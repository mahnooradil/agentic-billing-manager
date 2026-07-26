"use client";

import * as React from "react";
import { createFrontendClient } from "@pipedream/sdk/browser";
import { Loader2, Search, Plug } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import {
  getPipedreamCatalog,
  createPipedreamConnectToken,
  connectViaPipedream,
} from "@/services/connections/platform-connections.service";
import type { CatalogApp } from "@/services/types/platform-connections";

interface PipedreamCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: (message: string) => void;
  /** Pre-fills the search box when the dialog opens (e.g. deep-linked from the Billing Agent). */
  initialQuery?: string;
}

type Status = "loading" | "error" | "ready";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.map((p) => p[0]).join("") || name.trim()).slice(0, 2).toUpperCase();
}

/**
 * Browse the LIVE Pipedream app catalog and connect a provider through
 * Pipedream's managed OAuth flow. The browser SDK opens Pipedream's hosted
 * connect popup; on success we finalize the connection server-side (which stores
 * only a Pipedream account reference — never raw tokens). No fake status.
 */
export function PipedreamCatalogDialog({
  open,
  onOpenChange,
  onConnected,
  initialQuery,
}: PipedreamCatalogDialogProps) {
  // Initial value only — the parent forces a remount (via a `key` prop) when
  // it wants a fresh initialQuery, so this never needs to be re-synced later.
  const [query, setQuery] = React.useState(initialQuery ?? "");
  const [status, setStatus] = React.useState<Status>("loading");
  const [apps, setApps] = React.useState<CatalogApp[]>([]);
  const [configured, setConfigured] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [connecting, setConnecting] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Debounced catalog fetch while the dialog is open (setState only in the
  // deferred async continuation — never synchronously in the effect body).
  React.useEffect(() => {
    if (!open) return;
    let ignore = false;
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await getPipedreamCatalog(query);
        if (ignore) return;
        setConfigured(res.data.configured);
        setApps(res.data.apps);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Failed to load the catalog."
        );
        setStatus("error");
      }
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const handleConnect = async (app: CatalogApp) => {
    setActionError(null);
    setConnecting(app.nameSlug);
    try {
      const tokenRes = await createPipedreamConnectToken();
      const pd = createFrontendClient();
      pd.connectAccount({
        app: app.nameSlug,
        token: tokenRes.data.token,
        onSuccess: async (account: { id: string }) => {
          try {
            const res = await connectViaPipedream({
              platform: app.nameSlug,
              displayName: app.name,
              accountId: account.id,
            });
            onConnected(res.message ?? `${app.name} connected.`);
            onOpenChange(false);
          } catch (error) {
            setActionError(
              error instanceof ApiError
                ? error.message
                : "Could not finalize the connection."
            );
          } finally {
            setConnecting(null);
          }
        },
        onError: (err: { message?: string }) => {
          setActionError(err?.message ?? "The connection was cancelled.");
          setConnecting(null);
        },
      });

      // Fallback for a closed/cancelled popup: Pipedream's SDK doesn't always
      // fire onError when the user just closes or backs out of it, which used
      // to leave `connecting` stuck forever (blocking every other Connect
      // button). The main window regains focus once the popup closes either
      // way, so treat "still connecting this exact app a moment after focus
      // returns" as cancelled.
      const handleFocus = () => {
        window.removeEventListener("focus", handleFocus);
        setTimeout(() => {
          setConnecting((current) => (current === app.nameSlug ? null : current));
        }, 1000);
      };
      window.addEventListener("focus", handleFocus);
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : "Could not start the connection."
      );
      setConnecting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a platform</DialogTitle>
          <DialogDescription>
            Search thousands of apps and connect securely through Pipedream. Your
            credentials are handled by Pipedream and never stored here.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps — Stripe, Slack, Google, Notion…"
            className="pl-8"
            aria-label="Search apps"
          />
        </div>

        {actionError ? <FormAlert variant="error" message={actionError} /> : null}

        <div className="-mx-1 min-h-40 flex-1 overflow-y-auto px-1">
          {status === "loading" ? (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner label="Loading apps…" />
            </div>
          ) : status === "error" ? (
            <p className="py-16 text-center text-sm text-destructive">
              {loadError}
            </p>
          ) : !configured ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Pipedream isn&apos;t configured on the server yet.
            </p>
          ) : apps.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No apps match “{query}”.
            </p>
          ) : (
            <ul className="divide-y">
              {apps.map((app) => (
                <li key={app.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                    {initials(app.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{app.name}</p>
                    {app.description ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {app.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={connecting !== null}
                    onClick={() => handleConnect(app)}
                  >
                    {connecting === app.nameSlug ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plug />
                    )}
                    Connect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
