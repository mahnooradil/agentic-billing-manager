"use client";

import * as React from "react";
import { Plus, ReceiptText, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { Pagination } from "@/components/common/pagination";
import { useAlertState } from "@/hooks/use-alert-state";
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import { ApiError } from "@/services/api/client";
import { getBillingStats, listBillingRecords } from "@/services/billing/billing.service";
import { listPlatforms } from "@/services/platforms/platform.service";
import type { BillingRecord, BillingStats } from "@/services/types/billing";
import type { Platform } from "@/services/types/platform";
import { PlatformFormDialog } from "@/components/platforms/platform-form-dialog";
import { BillingTable } from "./billing-table";
import { BillingFormDialog } from "./billing-form-dialog";
import { DeleteBillingDialog } from "./delete-billing-dialog";
import { BillingStatsGrid } from "./billing-stats";
import { BillingToolbar, type BillingSort, type BillingStatusFilter } from "./billing-toolbar";

type ViewStatus = "loading" | "error" | "ready";

/** Billing records shown per page (client-side pagination). */
const PAGE_SIZE = 10;

const CACHE_KEY = "billing";
interface BillingCachePayload {
  records: BillingRecord[];
  stats: BillingStats | null;
  platforms: Platform[];
}

/**
 * Billing management screen: lists billing records and orchestrates the create/
 * edit/delete dialogs. Also loads the platform list so a record can be attached
 * to a platform. Refetches after every successful mutation.
 */
export function BillingView() {
  const cached = readPageCache<BillingCachePayload>(CACHE_KEY);
  const [status, setStatus] = React.useState<ViewStatus>(cached ? "ready" : "loading");
  const [records, setRecords] = React.useState<BillingRecord[]>(cached?.records ?? []);
  const [platforms, setPlatforms] = React.useState<Platform[]>(cached?.platforms ?? []);
  const [stats, setStats] = React.useState<BillingStats | null>(cached?.stats ?? null);
  const [loadError, setLoadError] = React.useState("");
  const [alert, setAlert] = useAlertState();

  // Create/Edit dialog state (key forces a fresh form on each open).
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<BillingRecord | null>(null);
  const [formKey, setFormKey] = React.useState(0);

  // Delete dialog state.
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<BillingRecord | null>(null);
  const [deleteKey, setDeleteKey] = React.useState(0);

  // "Create New Platform" shortcut — reuses the Platforms page's own dialog so
  // billing simply references Platforms (no duplicate platform management here).
  const [platformFormOpen, setPlatformFormOpen] = React.useState(false);
  const [platformFormKey, setPlatformFormKey] = React.useState(0);

  // Search / filter / pagination state (all client-side over the loaded list).
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<BillingStatusFilter>("all");
  const [sort, setSort] = React.useState<BillingSort>("date-desc");
  const [page, setPage] = React.useState(1);

  // Bumping reloadKey re-runs the fetch effect — the single source of loading.
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [billingResponse, statsResponse, platformsResponse] = await Promise.all([
          listBillingRecords(),
          getBillingStats(),
          listPlatforms(),
        ]);
        if (ignore) return;
        writePageCache(CACHE_KEY, {
          records: billingResponse.data.billingRecords,
          stats: statsResponse.data.stats,
          platforms: platformsResponse.data.platforms,
        });
        setRecords(billingResponse.data.billingRecords);
        setStats(statsResponse.data.stats);
        setPlatforms(platformsResponse.data.platforms);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(error instanceof ApiError ? error.message : "Failed to load billing records.");
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  // Apply search (customer/invoice) + status filter, then slice the page.
  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchesQuery =
        query === "" ||
        record.customerName.toLowerCase().includes(query) ||
        record.invoiceNumber.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [records, search, statusFilter]);

  // Sort the filtered set (does not change the count, only the order).
  const sorted = React.useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      switch (sort) {
        case "date-asc":
          return new Date(a.billingDate).getTime() - new Date(b.billingDate).getTime();
        case "date-desc":
          return new Date(b.billingDate).getTime() - new Date(a.billingDate).getTime();
        case "amount-asc":
          return a.amount - b.amount;
        case "amount-desc":
          return b.amount - a.amount;
        default:
          return 0;
      }
    });
    return copy;
  }, [filtered, sort]);

  const totalResults = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  // Clamp for display without a state-syncing effect (e.g. after a delete).
  const currentPage = Math.min(page, totalPages);
  const pageRecords = React.useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, currentPage]);

  // Changing search/filter must always return the user to the first page.
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const handleStatusChange = (value: BillingStatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };
  const handleSortChange = (value: BillingSort) => {
    setSort(value);
    setPage(1);
  };
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

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

  const openCreatePlatform = () => {
    setAlert(null);
    setPlatformFormKey((key) => key + 1);
    setPlatformFormOpen(true);
  };

  // Reloading re-fetches platforms, so the new one is immediately selectable.
  const handlePlatformCreated = (message: string) => {
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
      ) : records.length === 0 ? (
        // Manually creating a record needs a Platform to attach it to — but
        // auto_sync/email_sync records attach via a PlatformConnection instead,
        // so having zero manual Platforms only blocks CREATION, never display
        // (see the records.length > 0 branch below, reached regardless).
        noPlatforms ? (
          <EmptyState
            icon={ReceiptText}
            title="No platforms to bill"
            description="Every manual billing record belongs to a platform. Create one to start billing, or connect a platform on the Integrations page for automatic sync."
            action={
              <Button onClick={openCreatePlatform}>
                <Plus />
                Create New Platform
              </Button>
            }
          />
        ) : (
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
        )
      ) : (
        <>
          {stats ? <BillingStatsGrid stats={stats} /> : null}

          <div className="space-y-6">
            <BillingToolbar
              search={search}
              onSearchChange={handleSearchChange}
              status={statusFilter}
              onStatusChange={handleStatusChange}
              sort={sort}
              onSortChange={handleSortChange}
            />

            {filtered.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No matching records"
                description="No billing records match your search or filter. Try adjusting them."
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <>
                <div className="text-muted-foreground flex items-center justify-between text-sm">
                  <span>
                    {totalResults} {totalResults === 1 ? "result" : "results"}
                  </span>
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                </div>
                <BillingTable records={pageRecords} onEdit={openEdit} onDelete={openDelete} />
                <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
              </>
            )}
          </div>
        </>
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
      {/* Reused Platforms dialog: create a platform without leaving Billing. */}
      <PlatformFormDialog
        key={`platform-${platformFormKey}`}
        open={platformFormOpen}
        platform={null}
        onOpenChange={setPlatformFormOpen}
        onSaved={handlePlatformCreated}
      />
    </PageWrapper>
  );
}
