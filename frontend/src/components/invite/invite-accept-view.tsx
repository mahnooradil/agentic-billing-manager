"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, LogIn, Mail, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brand } from "@/components/layout/brand";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { FormAlert } from "@/components/common/form-alert";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/services/api/client";
import {
  previewInvitation,
  acceptInvitation,
} from "@/services/organizations/organization.service";
import type { InvitationPreview } from "@/services/types/organization";

type ViewStatus = "loading" | "error" | "ready";

const ROLE_LABEL: Record<InvitationPreview["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/** The `/invite/[token]` landing page — works whether the visitor is logged
 *  in, logged out, or has no account yet. Not wrapped in `ProtectedRoute` or
 *  `GuestRoute` (neither fits an "either auth state" page); branches on
 *  `useAuth()` itself. */
export function InviteAcceptView({ token }: { token: string }) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [preview, setPreview] = React.useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [accepting, setAccepting] = React.useState(false);
  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState(false);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await previewInvitation(token);
        if (ignore) return;
        setPreview(response.data);
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError ? error.message : "This invitation couldn't be loaded."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptInvitation(token);
      setAccepted(true);
      setTimeout(() => router.replace("/dashboard/overview"), 1500);
    } catch (error) {
      setAcceptError(
        error instanceof ApiError ? error.message : "Could not accept this invitation."
      );
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Brand />
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5">
          {status === "loading" || authLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner label="Loading invitation…" />
            </div>
          ) : status === "error" || !preview ? (
            <ErrorState description={loadError} />
          ) : accepted ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <p className="font-medium">You&apos;ve joined {preview.organizationName}</p>
              <p className="text-sm text-muted-foreground">Taking you to your dashboard…</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                  <Mail className="size-6 text-primary" />
                </span>
                <p className="font-heading text-lg font-semibold">
                  Join {preview.organizationName}
                </p>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve been invited as <strong>{ROLE_LABEL[preview.role]}</strong> for{" "}
                  <span className="font-medium text-foreground">{preview.email}</span>.
                </p>
              </div>

              {acceptError ? <FormAlert variant="error" message={acceptError} /> : null}

              {isAuthenticated ? (
                user?.email.toLowerCase() === preview.email.toLowerCase() ? (
                  <Button className="w-full" onClick={() => void handleAccept()} disabled={accepting}>
                    {accepting ? <Loader2 className="animate-spin" /> : null}
                    Accept invitation
                  </Button>
                ) : (
                  <div className="space-y-3 text-center text-sm text-muted-foreground">
                    <p>
                      You&apos;re signed in as <strong>{user?.email}</strong>, but this invite is
                      for a different email. Log out and sign in as {preview.email} to accept.
                    </p>
                  </div>
                )
              ) : preview.hasExistingAccount ? (
                <div className="space-y-3">
                  <p className="text-center text-sm text-muted-foreground">
                    You already have an account. Log in, then reopen this link to accept.
                  </p>
                  <Button
                    className="w-full"
                    render={
                      <Link href="/login">
                        <LogIn />
                        Log in
                      </Link>
                    }
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-center text-sm text-muted-foreground">
                    Create your account with {preview.email} to join automatically.
                  </p>
                  <Button
                    className="w-full"
                    render={
                      <Link href="/register">
                        <UserPlus />
                        Create account
                      </Link>
                    }
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
