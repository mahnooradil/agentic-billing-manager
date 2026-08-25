"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, Monitor, ShieldOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SectionHeader } from "@/components/common/section-header";
import { OtpCodeStep } from "@/components/auth/otp-code-step";
import { TextField } from "@/components/settings/settings-fields";
import { useAlertState } from "@/hooks/use-alert-state";
import { describeUserAgent } from "@/lib/user-agent";
import { formatRelativeTime, formatDateTime } from "@/lib/format";
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import { usePreferences } from "@/services/preferences/preferences-store";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/services/api/client";
import { authStore } from "@/services/auth/auth-store";
import {
  requestEmailChangeOtp,
  verifyEmailChangeOtp,
  signOutEverywhere,
  getSessions,
  revokeSession,
} from "@/services/auth/auth.service";
import {
  newEmailFormSchema,
  type NewEmailFormValues,
} from "@/lib/validations/auth";
import type { AuthSession } from "@/services/types/auth";

type EmailStep = "idle" | "otp";
type SessionsStatus = "loading" | "error" | "ready";

const SESSIONS_CACHE_KEY = "auth-sessions";

/** Authentication & access: change the sign-in email, review and revoke
 *  individual login sessions, or sign out of every other device at once. */
export function SecuritySettingsTab() {
  const { user } = useAuth();
  const { general } = usePreferences();

  // ── Change email ──
  const [emailStep, setEmailStep] = React.useState<EmailStep>("idle");
  const [pendingEmail, setPendingEmail] = React.useState("");
  const [emailAlert, setEmailAlert] = useAlertState();

  const {
    register: registerEmail,
    handleSubmit: handleEmailSubmit,
    reset: resetEmailForm,
    formState: { errors: emailErrors, isSubmitting: isRequestingCode },
  } = useForm<NewEmailFormValues>({ resolver: zodResolver(newEmailFormSchema) });

  const onRequestCode = async (data: NewEmailFormValues) => {
    setEmailAlert(null);
    try {
      await requestEmailChangeOtp({ newEmail: data.newEmail });
      setPendingEmail(data.newEmail);
      setEmailStep("otp");
    } catch (error) {
      setEmailAlert(
        error instanceof ApiError
          ? { type: "error", message: error.message, details: error.errors }
          : { type: "error", message: "Something went wrong." }
      );
    }
  };

  const handleVerifyEmail = async (code: string) => {
    const response = await verifyEmailChangeOtp({ newEmail: pendingEmail, code });
    authStore.updateUser(response.data.user);
    setEmailStep("idle");
    resetEmailForm({ newEmail: "" });
    setEmailAlert({ type: "success", message: "Your email address was updated." });
  };

  const handleResendEmailCode = () => requestEmailChangeOtp({ newEmail: pendingEmail }).then(() => {});

  // ── Sign out everywhere ──
  const [signingOut, setSigningOut] = React.useState(false);
  const [signOutAlert, setSignOutAlert] = useAlertState();

  const handleSignOutEverywhere = async () => {
    setSignOutAlert(null);
    setSigningOut(true);
    try {
      const response = await signOutEverywhere();
      authStore.updateToken(response.data.token);
      setSignOutAlert({
        type: "success",
        message: "Signed out of all other devices. This session stays signed in.",
      });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setSignOutAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Something went wrong.",
      });
    } finally {
      setSigningOut(false);
    }
  };

  // ── Active sessions ──
  const cachedSessions = readPageCache<AuthSession[]>(SESSIONS_CACHE_KEY);
  const [sessionsStatus, setSessionsStatus] = React.useState<SessionsStatus>(
    cachedSessions ? "ready" : "loading"
  );
  const [sessions, setSessions] = React.useState<AuthSession[]>(cachedSessions ?? []);
  const [sessionsError, setSessionsError] = React.useState("");
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getSessions();
        if (ignore) return;
        writePageCache(SESSIONS_CACHE_KEY, response.data.sessions);
        setSessions(response.data.sessions);
        setSessionsStatus("ready");
      } catch (error) {
        if (ignore) return;
        setSessionsError(
          error instanceof ApiError ? error.message : "Failed to load sessions."
        );
        setSessionsStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeSession(id);
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        writePageCache(SESSIONS_CACHE_KEY, next);
        return next;
      });
    } catch {
      // Reconciled on next reload.
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeader
          title="Email address"
          description="Your sign-in identity — verified with a code sent to the new address."
        />
        {emailAlert ? (
          <FormAlert variant={emailAlert.type} message={emailAlert.message} details={emailAlert.details} />
        ) : null}
        <Card>
          {emailStep === "idle" ? (
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Current email</p>
                  <p className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </div>
              <form
                onSubmit={(e) => void handleEmailSubmit(onRequestCode)(e)}
                noValidate
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <div className="flex-1">
                  <TextField
                    id="security-new-email"
                    label="New email"
                    placeholder="you@example.com"
                    error={emailErrors.newEmail?.message}
                    {...registerEmail("newEmail")}
                  />
                </div>
                <Button type="submit" disabled={isRequestingCode}>
                  {isRequestingCode ? <Loader2 className="animate-spin" /> : <Mail />}
                  Send code
                </Button>
              </form>
            </CardContent>
          ) : (
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3"
                aria-label="Cancel"
                onClick={() => setEmailStep("idle")}
              >
                <X className="size-4" />
              </Button>
              <OtpCodeStep
                email={pendingEmail}
                onVerify={handleVerifyEmail}
                onResend={handleResendEmailCode}
                onBack={() => setEmailStep("idle")}
              />
            </div>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Active sessions"
          description="Every device currently signed in to your account."
        />
        {sessionsStatus === "loading" ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner label="Loading sessions…" />
          </div>
        ) : sessionsStatus === "error" ? (
          <ErrorState
            description={sessionsError}
            onRetry={() => {
              setSessionsStatus("loading");
              setReloadKey((key) => key + 1);
            }}
          />
        ) : (
          <Card className="divide-y overflow-hidden p-0">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <Monitor className="size-4" />
                  </span>
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {describeUserAgent(session.userAgent)}
                      {session.isCurrent ? (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          This device
                        </span>
                      ) : null}
                    </p>
                    <p
                      className="text-xs text-muted-foreground"
                      title={formatDateTime(session.lastSeenAt, general)}
                    >
                      Active {formatRelativeTime(session.lastSeenAt, general)}
                    </p>
                  </div>
                </div>
                {!session.isCurrent ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revokingId === session.id}
                    onClick={() => void handleRevoke(session.id)}
                  >
                    {revokingId === session.id ? (
                      <Loader2 className="animate-spin" />
                    ) : null}
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader title="Sign out everywhere" description="Manage where you're signed in." />
        {signOutAlert ? <FormAlert variant={signOutAlert.type} message={signOutAlert.message} /> : null}
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Sign out of all other devices</p>
              <p className="text-xs text-muted-foreground">
                Ends every other session. This device stays signed in.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => void handleSignOutEverywhere()}
              disabled={signingOut}
            >
              {signingOut ? <Loader2 className="animate-spin" /> : <ShieldOff />}
              Sign out everywhere
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
