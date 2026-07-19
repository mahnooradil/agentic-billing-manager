"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BillingStatus } from "@/services/types/billing";

/** Status filter options: any real status, or "all" for no filtering. */
export type BillingStatusFilter = "all" | BillingStatus;

interface BillingToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: BillingStatusFilter;
  onStatusChange: (value: BillingStatusFilter) => void;
}

/**
 * Search + status-filter controls for the billing list. Presentational — the
 * parent owns the state and filtering logic. Mirrors the Platforms toolbar so
 * the two modules stay visually consistent.
 */
export function BillingToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
}: BillingToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by customer or invoice…"
          className="pl-8"
          aria-label="Search billing records"
        />
      </div>
      <Select
        value={status}
        onValueChange={(value) => onStatusChange(value as BillingStatusFilter)}
      >
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="Paid">Paid</SelectItem>
          <SelectItem value="Pending">Pending</SelectItem>
          <SelectItem value="Overdue">Overdue</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
