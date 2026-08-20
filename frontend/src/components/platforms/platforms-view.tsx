"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createFrontendClient } from "@pipedream/sdk/browser";
import { Boxes, Loader2, Mail, Pencil, Plug, Plus, Search, SearchX, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api/client";
import {
  getPipedreamCatalog,
  listPlatformConnections,
  createPipedreamConnectToken,
  connectViaPipedream,
} from "@/services/connections/platform-connections.service";
import { listPlatforms } from "@/services/platforms/platform.service";
import type {
  CatalogApp,
  PlatformConnection,
} from "@/services/types/platform-connections";
import type { Platform } from "@/services/types/platform";
import { DisconnectDialog } from "@/components/connections/disconnect-dialog";
import { PlatformFormDialog } from "./platform-form-dialog";
import { DeletePlatformDialog } from "./delete-platform-dialog";

type ViewStatus = "loading" | "error" | "ready";

/** Highest limit the catalog endpoint accepts today. */
const CATALOG_LIMIT = 100;

/** Curated, hand-picked slugs for the "Popular platforms" shortcut — verified
 *  against the live Pipedream catalog's exact `nameSlug` values. Not derived
 *  from any usage data; just the platforms most people look for first. */
const POPULAR_SLUGS = [
  "stripe",
  "slack_v2",
  "github",
  "google",
  "notion",
  "shopify",
  "zoom",
  "dropbox",
  "hubspot",
  "quickbooks",
  "mailchimp",
  "aws",
];

/** Reads `metadata.emailSync.lastSyncedAt` off a connection, if present —
 *  stamped by the backend's email-sync engine after each completed run. */
function lastEmailSyncedAt(metadata: Record<string, unknown>): Date | null {
  const emailSync = metadata.emailSync as { lastSyncedAt?: string } | undefined;
  if (!emailSync?.lastSyncedAt) return null;
  const date = new Date(emailSync.lastSyncedAt);
  return isNaN(date.getTime()) ? null : date;
}

/** Coarse "time ago" label — good enough for a status hint, not a live clock. */
function timeAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.map((part) => part[0]).join("");
  return (letters || name.trim()).slice(0, 2).toUpperCase() || "?";
}

/** A platform's logo when available, falling back to a monogram otherwise. */
function PlatformLogo({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground",
          className
        )}
      >
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        sizes="40px"
        className="object-contain p-1.5"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/** One connectable catalog app — used by both the "Popular" and "All
 *  platforms" sections so the card markup lives in exactly one place. */
function CatalogAppCard({
  app,
  connecting,
  onConnect,
}: {
  app: CatalogApp;
  connecting: string | null;
  onConnect: (app: CatalogApp) => void;
}) {
  return (
    <Card className="flex flex-row items-center gap-3 p-4">
      <PlatformLogo src={app.imgSrc} name={app.name} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{app.name}</p>
        {app.description ? (
          <p className="truncate text-xs text-muted-foreground">{app.description}</p>
        ) : null}
      </div>
      <Button size="sm" variant="outline" onClick={() => onConnect(app)}>
        {connecting === app.nameSlug ? (
          <>
            <Loader2 className="animate-spin" />
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
  );
}

/**
 * Platforms screen: the real connection experience for the live Pipedream
 * catalog, plus the manually-created `Platform` entries billing records
 * attach to. Section order: Connected → Your platforms → Popular → All.
 *
 * Wrapped in Suspense because the inner component reads `useSearchParams()`
 * (deep-link support for the Billing Agent's "Connect now" button).
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

  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [apps, setApps] = React.useState<CatalogApp[]>([]);
  const [configured, setConfigured] = React.useState(true);
  const [connections, setConnections] = React.useState<PlatformConnection[]>([]);
  const [platforms, setPlatforms] = React.useState<Platform[]>([]);
  const [loadError, setLoadError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  const [connecting, setConnecting] = React.useState<string | null>(null);
  // Per-app cleanup for the in-flight connect listeners/timers (focus,
  // visibility, hard timeout) — keyed by nameSlug so a manual cancel or any
  // completion path can tear them all down without leaking a stale listener
  // onto the NEXT attempt for the same app.
  const connectCleanupRef = React.useRef<Map<string, () => void>>(new Map());
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [alert, setAlert] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [disconnect, setDisconnect] = React.useState<{
    open: boolean;
    connection: PlatformConnection | null;
  }>({ open: false, connection: null });

  const [platformDialog, setPlatformDialog] = React.useState<{
    open: boolean;
    platform: Platform | null;
  }>({ open: false, platform: null });
  const [deletePlatformState, setDeletePlatformState] = React.useState<{
    open: boolean;
    platform: Platform | null;
  }>({ open: false, platform: null });

  const reload = () => setReloadKey((key) => key + 1);

  // Safety net for a back-navigation that restores this page from the
  // browser's bfcache (e.g. cancelling the Pipedream popup and going back):
  // any Connect button stuck mid-flight is cleared and the connections list
  // is refreshed, instead of staying stuck until a manual page refresh.
  React.useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      for (const cleanup of connectCleanupRef.current.values()) cleanup();
      connectCleanupRef.current.clear();
      setConnecting(null);
      reload();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // Deep-link from the Billing Agent chat ("Connect X now") — pre-fills the
  // search box with that platform so it surfaces immediately, then clears it.
  React.useEffect(() => {
    const connectParam = searchParams.get("connect");
    if (!connectParam) return;
    let ignore = false;
    (async () => {
      await Promise.resolve();
      if (ignore) return;
      setQuery(searchParams.get("label") ?? connectParam);
      router.replace(pathname, { scroll: false });
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced catalog + connections + platforms fetch (only debounced while
  // the user is actively typing a search — the initial load and reloads run
  // immediately).
  React.useEffect(() => {
    let ignore = false;
    const timer = setTimeout(
      async () => {
        setStatus("loading");
        try {
          const [catalogRes, connectionsRes, platformsRes] = await Promise.all([
            getPipedreamCatalog(query, CATALOG_LIMIT),
            listPlatformConnections(),
            listPlatforms(),
          ]);
          if (ignore) return;
          setConfigured(catalogRes.data.configured);
          setApps(catalogRes.data.apps);
          setConnections(connectionsRes.data.connections);
          setPlatforms(platformsRes.data.platforms);
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
  }, [query, reloadKey]);

  const retry = () => {
    setStatus("loading");
    reload();
  };

  const connectedByPlatform = React.useMemo(() => {
    const map = new Map<string, PlatformConnection>();
    for (const c of connections) {
      if (c.connectionType === "oauth") map.set(c.platform, c);
    }
    return map;
  }, [connections]);

  const connectedApps = React.useMemo(
    () => Array.from(connectedByPlatform.values()),
    [connectedByPlatform]
  );

  const browseApps = React.useMemo(
    () => apps.filter((app) => !connectedByPlatform.has(app.nameSlug)),
    [apps, connectedByPlatform]
  );

  // Popular platforms — a fixed, curated subset of `browseApps`, in curated
  // (not catalog) order. Excluded from "All platforms" below so nothing is
  // ever shown twice on the same page.
  const popularApps = React.useMemo(() => {
    const bySlug = new Map(browseApps.map((app) => [app.nameSlug, app]));
    return POPULAR_SLUGS.map((slug) => bySlug.get(slug)).filter(
      (app): app is CatalogApp => Boolean(app)
    );
  }, [browseApps]);

  const popularSlugSet = React.useMemo(
    () => new Set(popularApps.map((app) => app.nameSlug)),
    [popularApps]
  );

  const otherApps = React.useMemo(
    () => browseApps.filter((app) => !popularSlugSet.has(app.nameSlug)),
    [browseApps, popularSlugSet]
  );

  // While searching, show every match in one list (no curated split) — only
  // the idle/browse view separates Popular from everything else.
  const allSectionApps = query ? browseApps : otherApps;

  // The full catalog can be a few thousand apps — reveal it in chunks instead
  // of rendering every card up front. An earlier scroll-triggered
  // (IntersectionObserver) version turned out unreliable at this catalog size
  // (a single batch renders taller than any reasonable trigger margin, so it
  // read as permanently "stuck" once the user stopped scrolling exactly at
  // the edge). An explicit "Load more" button has no such geometry to get
  // wrong — it always works on click, every time.
  const REVEAL_BATCH = 120;
  const [visibleCount, setVisibleCount] = React.useState(REVEAL_BATCH);
  // Reset the reveal count when a new list loads (adjusted during render,
  // per React's guidance for state that depends on a changing key — not in
  // an effect, since that would cause an extra cascading render).
  const revealResetKey = `${query}:${reloadKey}`;
  const [lastRevealResetKey, setLastRevealResetKey] = React.useState(revealResetKey);
  if (lastRevealResetKey !== revealResetKey) {
    setLastRevealResetKey(revealResetKey);
    setVisibleCount(REVEAL_BATCH);
  }
  const visibleApps = allSectionApps.slice(0, visibleCount);
  const hasMoreApps = visibleCount < allSectionApps.length;
  const loadMore = () =>
    setVisibleCount((count) => Math.min(count + REVEAL_BATCH, allSectionApps.length));

  const logoFor = (nameSlug: string): string | null =>
    apps.find((app) => app.nameSlug === nameSlug)?.imgSrc ?? null;

  const handleConnect = async (app: CatalogApp) => {
    // Clicking the same button again while it's connecting cancels it — an
    // always-available manual escape hatch, since Pipedream's popup doesn't
    // reliably report every way a user can back out of it.
    if (connecting === app.nameSlug) {
      connectCleanupRef.current.get(app.nameSlug)?.();
      connectCleanupRef.current.delete(app.nameSlug);
      setConnecting(null);
      return;
    }

    setActionError(null);
    setConnecting(app.nameSlug);

    const finish = () => {
      connectCleanupRef.current.get(app.nameSlug)?.();
      connectCleanupRef.current.delete(app.nameSlug);
      setConnecting((current) => (current === app.nameSlug ? null : current));
    };

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
            setAlert({
              type: "success",
              message: res.message ?? `${app.name} connected.`,
            });
            reload();
          } catch (error) {
            setActionError(
              error instanceof ApiError
                ? error.message
                : "Could not finalize the connection."
            );
          } finally {
            finish();
          }
        },
        onError: (err: { message?: string }) => {
          setActionError(err?.message ?? "The connection was cancelled.");
          finish();
        },
      });

      // Pipedream's SDK doesn't always fire onError when the popup is just
      // closed, backed-out of, or cancelled — these three fallbacks (window
      // focus, tab visibility, and a hard timeout) guarantee `connecting`
      // never stays stuck forever even if every one of them is missed.
      const handleReturn = () => setTimeout(finish, 1000);
      const handleVisibility = () => {
        if (document.visibilityState === "visible") handleReturn();
      };
      window.addEventListener("focus", handleReturn);
      document.addEventListener("visibilitychange", handleVisibility);
      const hardTimeout = setTimeout(finish, 45_000);

      connectCleanupRef.current.set(app.nameSlug, () => {
        window.removeEventListener("focus", handleReturn);
        document.removeEventListener("visibilitychange", handleVisibility);
        clearTimeout(hardTimeout);
      });
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "Could not start the connection."
      );
      finish();
    }
  };

  const openDisconnect = (connection: PlatformConnection) => {
    setAlert(null);
    setDisconnect({ open: true, connection });
  };

  const handleDisconnected = (message: string) => {
    setAlert({ type: "success", message });
    reload();
  };

  const openCreatePlatform = () => {
    setAlert(null);
    setPlatformDialog({ open: true, platform: null });
  };
  const openEditPlatform = (platform: Platform) => {
    setAlert(null);
    setPlatformDialog({ open: true, platform });
  };
  const handlePlatformSaved = (message: string) => {
    setAlert({ type: "success", message });
    reload();
  };
  const openDeletePlatform = (platform: Platform) => {
    setAlert(null);
    setDeletePlatformState({ open: true, platform });
  };
  const handlePlatformDeleted = (message: string) => {
    setAlert({ type: "success", message });
    reload();
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Integrations"
        description="Connect the platforms you're billed on — every invoice and subscription stays in sync, automatically."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuery("Gmail")}
          >
            <Mail />
            Connect email for invoice sync
          </Button>
        }
      />

      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}
      {actionError ? <FormAlert variant="error" message={actionError} /> : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search platforms — Stripe, Slack, Google, Notion…"
          className="pl-8"
          aria-label="Search platforms"
        />
      </div>
      {query.toLowerCase() === "gmail" ? (
        <p className="text-sm text-muted-foreground">
          No direct billing sync for a platform? Connect{" "}
          <span className="font-medium text-foreground">Gmail</span> below
          (not the generic &quot;Google&quot; app) and we&apos;ll scan for
          invoice emails automatically — a fallback behind direct sync, not a
          replacement for it.
        </p>
      ) : null}

      {status === "loading" && apps.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <LoadingSpinner label="Loading platforms…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : !configured ? (
        <EmptyState
          icon={Boxes}
          title="Pipedream isn't connected"
          description="This server doesn't have Pipedream configured yet, so no platforms can be shown."
        />
      ) : (
        <div className="space-y-8">
          {connectedApps.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-heading text-sm font-semibold text-muted-foreground">
                Connected platforms
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {connectedApps.map((connection) => (
                  <Card
                    key={connection.id}
                    className="flex flex-col gap-3 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <PlatformLogo
                        src={logoFor(connection.platform)}
                        name={connection.displayName}
                        className="size-10"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {connection.displayName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {connection.accountIdentifier ?? "Connected"}
                        </p>
                        {(() => {
                          const syncedAt = lastEmailSyncedAt(connection.metadata);
                          return syncedAt ? (
                            <p className="truncate text-xs text-muted-foreground">
                              Invoices last checked {timeAgo(syncedAt)}
                            </p>
                          ) : null;
                        })()}
                      </div>
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          connection.status === "connected"
                            ? "bg-emerald-500"
                            : "bg-red-500"
                        )}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => openDisconnect(connection)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm font-semibold text-muted-foreground">
                Your platforms
              </h3>
              <Button size="sm" variant="outline" onClick={openCreatePlatform}>
                <Plus />
                Add platform
              </Button>
            </div>
            {platforms.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="No platforms yet"
                description="Add a platform you bill customers through, so billing records have something to attach to."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {platforms.map((platform) => (
                  <Card key={platform.id} className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <PlatformLogo
                        src={platform.logo ?? null}
                        name={platform.name}
                        className="size-10"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {platform.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {platform.website ?? platform.slug}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          platform.status === "Active"
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/40"
                        )}
                      />
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit platform"
                        onClick={() => openEditPlatform(platform)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete platform"
                        className="text-destructive hover:text-destructive"
                        onClick={() => openDeletePlatform(platform)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {!query && popularApps.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-heading text-sm font-semibold text-muted-foreground">
                Popular platforms
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {popularApps.map((app) => (
                  <CatalogAppCard
                    key={app.id}
                    app={app}
                    connecting={connecting}
                    onConnect={handleConnect}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <h3 className="font-heading text-sm font-semibold text-muted-foreground">
              {query ? "Search results" : "All platforms"}
            </h3>
            {allSectionApps.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No matching platforms"
                description={`No platforms match "${query}".`}
              />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleApps.map((app) => (
                    <CatalogAppCard
                      key={app.id}
                      app={app}
                      connecting={connecting}
                      onConnect={handleConnect}
                    />
                  ))}
                </div>
                {hasMoreApps ? (
                  <div className="flex justify-center py-4">
                    <Button variant="outline" onClick={loadMore}>
                      Load more platforms ({allSectionApps.length - visibleCount} remaining)
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      <DisconnectDialog
        open={disconnect.open}
        onOpenChange={(open) => setDisconnect((state) => ({ ...state, open }))}
        connection={disconnect.connection}
        onDisconnected={handleDisconnected}
      />
      <PlatformFormDialog
        open={platformDialog.open}
        onOpenChange={(open) => setPlatformDialog((state) => ({ ...state, open }))}
        platform={platformDialog.platform}
        onSaved={handlePlatformSaved}
      />
      <DeletePlatformDialog
        open={deletePlatformState.open}
        onOpenChange={(open) => setDeletePlatformState((state) => ({ ...state, open }))}
        platform={deletePlatformState.platform}
        onDeleted={handlePlatformDeleted}
      />
    </PageWrapper>
  );
}
