"use client";

import * as React from "react";
import { Crown, Loader2, Mail, Shield, User, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SectionHeader } from "@/components/common/section-header";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/services/api/client";
import {
  getMyOrganization,
  getMembers,
  updateMemberRole,
  removeMember,
  revokeInvitation,
} from "@/services/organizations/organization.service";
import type { Member, MembershipRole, Organization } from "@/services/types/organization";
import { InviteMemberDialog } from "./team/invite-member-dialog";

type ViewStatus = "loading" | "error" | "ready";

const ROLE_ICON: Record<MembershipRole, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.map((part) => part[0]).join("");
  return (letters || name.trim()).slice(0, 2).toUpperCase() || "?";
}

/** "expires in 3 days" / "expires today" / "expired" for a FUTURE date —
 *  `formatRelativeTime` in lib/format.ts only handles past dates (it always
 *  read a future expiry as a negative "ago" and printed "Just now" for every
 *  invitation, regardless of its real expiry). `now` is passed in rather than
 *  read via `Date.now()` here so this stays a pure function of its arguments
 *  (react-hooks/purity forbids calling it during render). */
function formatExpiresIn(expiresAtIso: string, now: number): string {
  const expiresAt = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiresAt)) return "";
  const days = Math.ceil((expiresAt - now) / 86_400_000);
  if (days <= 0) return "expired";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

/** Team members + pending invitations. Only an owner/admin sees invite/manage
 *  actions — a plain member gets a read-only roster. */
export function TeamSettingsTab() {
  const { user } = useAuth();
  const { general } = usePreferences();

  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [organization, setOrganization] = React.useState<Organization | null>(null);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [pendingInvitations, setPendingInvitations] = React.useState<
    Awaited<ReturnType<typeof getMembers>>["data"]["pendingInvitations"]
  >([]);
  const [loadError, setLoadError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [alert, setAlert] = React.useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  // Captured once per fetch (not read via Date.now() during render — see
  // formatExpiresIn's docstring).
  const [fetchedAt, setFetchedAt] = React.useState<number | null>(null);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<Member | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const [changingRoleId, setChangingRoleId] = React.useState<string | null>(null);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [orgRes, membersRes] = await Promise.all([getMyOrganization(), getMembers()]);
        if (ignore) return;
        setOrganization(orgRes.data.organization);
        setMembers(membersRes.data.members);
        setPendingInvitations(membersRes.data.pendingInvitations);
        setFetchedAt(Date.now());
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(error instanceof ApiError ? error.message : "Failed to load your team.");
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);
  const canManage = organization?.role === "owner" || organization?.role === "admin";
  const isOwner = organization?.role === "owner";

  const handleRoleChange = async (member: Member, role: "admin" | "member") => {
    setChangingRoleId(member.id);
    setAlert(null);
    try {
      await updateMemberRole(member.id, { role });
      setAlert({ type: "success", message: `${member.user.fullName}'s role updated.` });
      reload();
    } catch (error) {
      setAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Could not update the role.",
      });
    } finally {
      setChangingRoleId(null);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeMember(removeTarget.id);
      setAlert({ type: "success", message: `${removeTarget.user.fullName} was removed.` });
      setRemoveTarget(null);
      reload();
    } catch (error) {
      setAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Could not remove this member.",
      });
    } finally {
      setRemoving(false);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setRevokingId(invitationId);
    try {
      await revokeInvitation(invitationId);
      setPendingInvitations((prev) => prev.filter((i) => i.id !== invitationId));
    } catch (error) {
      setAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Could not revoke the invitation.",
      });
    } finally {
      setRevokingId(null);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner label="Loading your team…" />
      </div>
    );
  }
  if (status === "error" || !organization) {
    return <ErrorState description={loadError} onRetry={reload} />;
  }

  return (
    <div className="space-y-8">
      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}

      <section className="space-y-4">
        <SectionHeader
          title={organization.name}
          description={`${members.length} member${members.length === 1 ? "" : "s"} in this organization.`}
          actions={
            canManage ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus />
                Invite member
              </Button>
            ) : undefined
          }
        />

        <Card className="divide-y overflow-hidden p-0">
          {members.map((member) => {
            const RoleIcon = ROLE_ICON[member.role];
            const isSelf = member.user.id === user?.id;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-xs font-semibold text-secondary-foreground">
                    {initialsOf(member.user.fullName)}
                  </span>
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {member.user.fullName}
                      {isSelf ? (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{member.user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isOwner && member.role !== "owner" ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        void handleRoleChange(member, value as "admin" | "member")
                      }
                      disabled={changingRoleId === member.id}
                    >
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        member.role === "owner"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <RoleIcon className="size-3" />
                      {member.role === "owner" ? "Owner" : "Admin"}
                    </span>
                  )}

                  {canManage && member.role !== "owner" && !isSelf ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRemoveTarget(member)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </Card>
      </section>

      {canManage ? (
        <section className="space-y-4">
          <SectionHeader
            title="Pending invitations"
            description="Invites that haven't been accepted yet."
          />
          {pendingInvitations.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No pending invitations"
              description="Everyone you've invited has already joined, or you haven't invited anyone yet."
            />
          ) : (
            <Card className="divide-y overflow-hidden p-0">
              {pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <Mail className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{invitation.email}</p>
                      <p
                        className="text-xs text-muted-foreground"
                        title={formatDateTime(invitation.expiresAt, general)}
                      >
                        Invited as {invitation.role} ·{" "}
                        {formatExpiresIn(invitation.expiresAt, fetchedAt ?? 0)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revokingId === invitation.id}
                    onClick={() => void handleRevoke(invitation.id)}
                  >
                    {revokingId === invitation.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <X />
                    )}
                    Revoke
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </section>
      ) : null}

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(message) => {
          setAlert({ type: "success", message });
          reload();
        }}
      />

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{removeTarget?.user.fullName}</span>{" "}
              will lose access to this organization&apos;s data immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleRemove()}
              disabled={removing}
            >
              {removing ? <Loader2 className="animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
