"use client";

import * as React from "react";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/services/api/client";
import { getMyOrganizations, switchOrganization } from "@/services/auth/auth.service";
import type { MyOrganization } from "@/services/types/organization";

const ROLE_LABEL: Record<MyOrganization["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/**
 * Always-visible workspace identity + switcher — lives in the top navbar on
 * every dashboard page, so which workspace is active is never ambiguous
 * (unlike the old "Workspaces" menu buried inside the user avatar dropdown,
 * which only ever rendered once a user belonged to more than one
 * organization — the common single-workspace case showed nothing at all).
 * Shown even for a single-workspace user, so the active workspace's real
 * name is always confirmed, not just switchable.
 */
export function WorkspaceIndicator() {
  const { onWorkspaceSwitched } = useAuth();

  const [organizations, setOrganizations] = React.useState<MyOrganization[] | null>(null);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [switchError, setSwitchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getMyOrganizations();
        if (ignore) return;
        setOrganizations(response.data.organizations);
      } catch {
        // Non-critical — the indicator just doesn't appear on failure.
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const handleSwitch = async (organization: MyOrganization) => {
    if (organization.isActive || switchingId) return;
    setSwitchingId(organization.id);
    setSwitchError(null);
    try {
      await switchOrganization({ organizationId: organization.id });
      // This component lives in the persistent dashboard layout, so a route
      // change alone never remounts it — the active-org checkmark and the
      // spinner both have to be cleared explicitly here, not left to reload.
      setOrganizations(
        (prev) => prev?.map((o) => ({ ...o, isActive: o.id === organization.id })) ?? prev
      );
      onWorkspaceSwitched();
    } catch (err) {
      setSwitchError(
        err instanceof ApiError ? err.message : "Could not switch workspace."
      );
    } finally {
      setSwitchingId(null);
    }
  };

  const activeOrganization = organizations?.find((o) => o.isActive) ?? null;

  // Nothing to show until the first fetch resolves — appearing a beat after
  // the rest of the header (rather than reserving empty space) reads better
  // than a layout-shifting skeleton for something this small.
  if (!activeOrganization) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
        )}
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Workspace
          </span>
          <span className="max-w-40 truncate text-sm font-medium text-foreground">
            {activeOrganization.name}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Your workspaces
          </DropdownMenuLabel>
          {(organizations ?? []).map((organization) => (
            <DropdownMenuItem
              key={organization.id}
              disabled={switchingId !== null}
              onClick={() => void handleSwitch(organization)}
            >
              <Building2 />
              <span className="min-w-0 flex-1 truncate">{organization.name}</span>
              <span className="text-xs text-muted-foreground">
                {ROLE_LABEL[organization.role]}
              </span>
              {switchingId === organization.id ? (
                <Loader2 className="animate-spin" />
              ) : organization.isActive ? (
                <Check />
              ) : null}
            </DropdownMenuItem>
          ))}
          {switchError ? (
            <p className="px-2 py-1.5 text-xs text-destructive">{switchError}</p>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
