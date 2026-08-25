"use client";

import * as React from "react";
import { Check, Loader2, LogOut, Settings, User, Building2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

/** Derive up to two uppercase initials from a display name. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Avatar dropdown showing the authenticated user, with a working Sign out
 * action (clears the session and redirects to /login via the auth context)
 * and a workspace switcher (only shown once the user actually belongs to
 * more than one organization — the common single-workspace case stays
 * exactly as simple as before). Profile/Settings items remain inert (out of
 * Phase 5B scope).
 */
export function UserMenu() {
  const { user, logout, onWorkspaceSwitched } = useAuth();

  const displayName = user?.fullName ?? "Account";
  const email = user?.email ?? "";

  const [organizations, setOrganizations] = React.useState<MyOrganization[] | null>(null);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [switchError, setSwitchError] = React.useState<string | null>(null);

  // Fetched once on mount, not lazily on open — the list is small and this
  // is a low-traffic call, so it's simpler than tracking open state.
  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getMyOrganizations();
        if (ignore) return;
        setOrganizations(response.data.organizations);
      } catch {
        // Non-critical — the switcher just doesn't appear on failure.
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open user menu"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "rounded-full"
        )}
      >
        <Avatar size="sm">
          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {/* Base UI: GroupLabel must live inside a Menu.Group (DropdownMenuGroup). */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{displayName}</span>
              {email ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {email}
                </span>
              ) : null}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {organizations && organizations.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Workspaces
              </DropdownMenuLabel>
              {organizations.map((organization) => (
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
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => logout()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
