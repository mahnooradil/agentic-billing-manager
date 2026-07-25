"use client";

import * as React from "react";
import { Boxes, Plus, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { Pagination } from "@/components/common/pagination";
import { ApiError } from "@/services/api/client";
import { listPlatforms } from "@/services/platforms/platform.service";
import { ConnectionsPanel } from "@/components/connections/connections-panel";
import type { Platform } from "@/services/types/platform";
import { PlatformCard } from "./platform-card";
import { PlatformFormDialog } from "./platform-form-dialog";
import { DeletePlatformDialog } from "./delete-platform-dialog";
import {
  PlatformsToolbar,
  type PlatformStatusFilter,
} from "./platforms-toolbar";

type ViewStatus = "loading" | "error" | "ready";

/** Platforms shown per page (client-side pagination). */
const PAGE_SIZE = 10;

/**
 * Platform management screen: lists platforms and orchestrates the create/edit/
 * delete dialogs. Refetches the list after every successful mutation.
 */
export function PlatformsView() {
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [platforms, setPlatforms] = React.useState<Platform[]>([]);
  const [loadError, setLoadError] = React.useState("");
  const [alert, setAlert] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Create/Edit dialog state (key forces a fresh form on each open).
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Platform | null>(null);
  const [formKey, setFormKey] = React.useState(0);

  // Delete dialog state.
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Platform | null>(null);
  const [deleteKey, setDeleteKey] = React.useState(0);

  // Search / filter / pagination state (all client-side over the loaded list).
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<PlatformStatusFilter>("all");
  const [page, setPage] = React.useState(1);

  // Bumping reloadKey re-runs the fetch effect — the single source of loading.
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  // Apply search (name/slug) + status filter, then slice the current page.
  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return platforms.filter((platform) => {
      const matchesQuery =
        query === "" ||
        platform.name.toLowerCase().includes(query) ||
        platform.slug.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "all" || platform.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [platforms, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp for display without a state-syncing effect (e.g. after a delete).
  const currentPage = Math.min(page, totalPages);
  const pagePlatforms = React.useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // Changing search/filter must always return the user to the first page.
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const handleStatusChange = (value: PlatformStatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await listPlatforms();
        if (ignore) return;
        setPlatforms(response.data.platforms);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Failed to load platforms."
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

  const openCreate = () => {
    setAlert(null);
    setEditTarget(null);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  };

  const openEdit = (platform: Platform) => {
    setAlert(null);
    setEditTarget(platform);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  };

  const openDelete = (platform: Platform) => {
    setAlert(null);
    setDeleteTarget(platform);
    setDeleteKey((key) => key + 1);
    setDeleteOpen(true);
  };

  const handleSaved = (message: string) => {
    setAlert({ type: "success", message });
    reload();
  };

  const handleDeleted = (message: string) => {
    setAlert({ type: "success", message });
    reload();
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Platforms"
        description="Connect and manage the platforms you are billed on."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            New platform
          </Button>
        }
      />

      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}

      <ConnectionsPanel />

      {status === "loading" ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <LoadingSpinner label="Loading platforms…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : platforms.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No platforms yet"
          description="Create your first platform to get started."
          action={
            <Button onClick={openCreate}>
              <Plus />
              New platform
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <PlatformsToolbar
            search={search}
            onSearchChange={handleSearchChange}
            status={statusFilter}
            onStatusChange={handleStatusChange}
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matching platforms"
              description="No platforms match your search or filter. Try adjusting them."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pagePlatforms.map((platform) => (
                  <PlatformCard
                    key={platform.id}
                    platform={platform}
                    onEdit={openEdit}
                    onDelete={openDelete}
                  />
                ))}
              </div>
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      )}

      <PlatformFormDialog
        key={`form-${formKey}`}
        open={formOpen}
        platform={editTarget}
        onOpenChange={setFormOpen}
        onSaved={handleSaved}
      />
      <DeletePlatformDialog
        key={`delete-${deleteKey}`}
        open={deleteOpen}
        platform={deleteTarget}
        onOpenChange={setDeleteOpen}
        onDeleted={handleDeleted}
      />
    </PageWrapper>
  );
}
