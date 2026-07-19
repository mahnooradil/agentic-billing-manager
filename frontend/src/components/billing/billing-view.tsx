"use client";

import * as React from "react";
import { Plus, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { ApiError } from "@/services/api/client";
import { listBillingRecords } from "@/services/billing/billing.service";
import { listPlatforms } from "@/services/platforms/platform.service";
import type { BillingRecord } from "@/services/types/billing";
import type { Platform } from "@/services/types/platform";
import { BillingCard } from "./billing-card";
import { BillingFormDialog } from "./billing-form-dialog";
import { DeleteBillingDialog } from "./delete-billing-dialog";

type ViewStatus = "loading" | "error" | "ready";

/**
 * Billing management screen: lists billing records and orchestrates the create/
 * edit/delete dialogs. Also loads the platform list so a record can be attached
 * to a platform. Refetches after every successful mutation.
 */
export function BillingView() {
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [records, setRecords] = React.useState<BillingRecord[]>([]);
  const [platforms, setPlatforms] = React.useState<Platform[]>([]);
  const [loadError, setLoadError] = React.useState("");
  const [alert, setAlert] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Create/Edit dialog state (key forces a fresh form on each open).
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<BillingRecord | null>(null);
  const [formKey, setFormKey] = React.useState(0);

  // Delete dialog state.
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<BillingRecord | null>(
    null
  );
  const [deleteKey, setDeleteKey] = React.useState(0);

  // Bumping reloadKey re-runs the fetch effect — the single source of loading.
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [billingResponse, platformsResponse] = await Promise.all([
          listBillingRecords(),
          listPlatforms(),
        ]);
        if (ignore) return;
        setRecords(billingResponse.data.billingRecords);
        setPlatforms(platformsResponse.data.platforms);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Failed to load billing records."
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

  const openEdit = (record: BillingRecord) => {
    setAlert(null);
    setEditTarget(record);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  };

  const openDelete = (record: BillingRecord) => {
    setAlert(null);
    setDeleteTarget(record);
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

  // A billing record must belong to a platform, so creation needs at least one.
  const noPlatforms = platforms.length === 0;

  return (
    <PageWrapper>
      <PageHeader
        title="Billing"
        description="Track invoices and payment status across your platforms."
        actions={
          <Button onClick={openCreate} disabled={noPlatforms}>
            <Plus />
            New billing record
          </Button>
        }
      />

      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}

      {status === "loading" ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <LoadingSpinner label="Loading billing records…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : noPlatforms ? (
        <EmptyState
          icon={ReceiptText}
          title="No platforms to bill"
          description="Create a platform first — every billing record must belong to a platform."
        />
      ) : records.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No billing records yet"
          description="Create your first billing record to get started."
          action={
            <Button onClick={openCreate}>
              <Plus />
              New billing record
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {records.map((record) => (
            <BillingCard
              key={record.id}
              record={record}
              onEdit={openEdit}
              onDelete={openDelete}
            />
          ))}
        </div>
      )}

      <BillingFormDialog
        key={`form-${formKey}`}
        open={formOpen}
        record={editTarget}
        platforms={platforms}
        onOpenChange={setFormOpen}
        onSaved={handleSaved}
      />
      <DeleteBillingDialog
        key={`delete-${deleteKey}`}
        open={deleteOpen}
        record={deleteTarget}
        onOpenChange={setDeleteOpen}
        onDeleted={handleDeleted}
      />
    </PageWrapper>
  );
}
