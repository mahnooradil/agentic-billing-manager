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
import type { PlatformStatus } from "@/services/types/platform";

/** Status filter options: any real status, or "all" for no filtering. */
export type PlatformStatusFilter = "all" | PlatformStatus;

interface PlatformsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: PlatformStatusFilter;
  onStatusChange: (value: PlatformStatusFilter) => void;
}

/**
 * Search + status-filter controls for the platforms list. Presentational — the
 * parent owns the state and the filtering logic. Reuses the shared Input and
 * Select primitives so it matches the rest of the UI.
 */
export function PlatformsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
}: PlatformsToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or slug…"
          className="pl-8"
          aria-label="Search platforms"
        />
      </div>
      <Select
        value={status}
        onValueChange={(value) => onStatusChange(value as PlatformStatusFilter)}
      >
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="Active">Active</SelectItem>
          <SelectItem value="Inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
