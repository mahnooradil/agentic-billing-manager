"use client";

import * as React from "react";
import { Boxes, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { ApiError } from "@/services/api/client";
import { listPlatforms } from "@/services/platforms/platform.service";
import type { Platform } from "@/services/types/platform";
import { PlatformCard } from "./platform-card";
import { PlatformFormDialog } from "./platform-form-dialog";
import { DeletePlatformDialog } from "./delete-platform-dialog";

type ViewStatus = "loading" | "error" | "ready";

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

  // Bumping reloadKey re-runs the fetch effect — the single source of loading.
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((platform) => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              onEdit={openEdit}
              onDelete={openDelete}
            />
          ))}
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
