"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useAlertState } from "@/hooks/use-alert-state";
import { readPageCache, writePageCache } from "@/lib/page-data-cache";
import { ApiError } from "@/services/api/client";
import {
  getUserSettings,
  updateUserSettings,
} from "@/services/settings/settings.service";
import { toUserSettings, type UserSettingsResource } from "@/services/types/settings";
import { TextField, ToggleField } from "@/components/settings/settings-fields";
import {
  createSlackLinkCode,
  getSlackInstallUrl,
  getSlackStatus,
} from "@/services/slack/slack.service";

/** Shared with general-tab.tsx — both read the exact same /settings resource,
 *  so one cache entry serves either tab, whichever loads first. */
const SETTINGS_CACHE_KEY = "user-settings";

const SLACK_WEBHOOK_REGEX = /^https:\/\/hooks\.slack\.com\/services\/.+$/;

const notificationsFormSchema = z.object({
  enabled: z.boolean(),
  billingAlerts: z.boolean(),
  recommendationAlerts: z.boolean(),
  usageAlerts: z.boolean(),
  highSpendThreshold: z
    .number({ message: "Must be a number" })
    .int()
    .min(1)
    .max(100),
  slackWebhookUrl: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || SLACK_WEBHOOK_REGEX.test(value),
      "Must be a Slack Incoming Webhook URL (https://hooks.slack.com/services/...)"
    ),
});
type NotificationsFormValues = z.infer<typeof notificationsFormSchema>;

type ViewStatus = "loading" | "error" | "ready";

/** Which automated alerts the user receives. */
export function NotificationsSettingsTab() {
  const cachedRaw = readPageCache<UserSettingsResource>(SETTINGS_CACHE_KEY);
  const cachedGroups = cachedRaw ? toUserSettings(cachedRaw) : null;
  const [status, setStatus] = React.useState<ViewStatus>(cachedGroups ? "ready" : "loading");
  const [loadError, setLoadError] = React.useState("");
  const [alert, setAlert] = useAlertState();
  const [reloadKey, setReloadKey] = React.useState(0);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NotificationsFormValues>({
    resolver: zodResolver(notificationsFormSchema),
    defaultValues: cachedGroups
      ? { ...cachedGroups.notifications, slackWebhookUrl: cachedGroups.notifications.slackWebhookUrl ?? "" }
      : undefined,
  });

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getUserSettings();
        if (ignore) return;
        writePageCache(SETTINGS_CACHE_KEY, response.data.settings);
        const groups = toUserSettings(response.data.settings);
        // `slackWebhookUrl` is optional on the wire (unset until first
        // configured) but the form field needs a real string to control.
        reset({ ...groups.notifications, slackWebhookUrl: groups.notifications.slackWebhookUrl ?? "" });
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Failed to load settings."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey, reset]);

  const onSubmit = async (data: NotificationsFormValues) => {
    setAlert(null);
    try {
      await updateUserSettings({ notifications: data });
      setAlert({ type: "success", message: "Notification settings saved." });
    } catch (error) {
      setAlert(
        error instanceof ApiError
          ? { type: "error", message: error.message, details: error.errors }
          : { type: "error", message: "Something went wrong." }
      );
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner label="Loading…" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        description={loadError}
        onRetry={() => {
          setStatus("loading");
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        noValidate
        className="space-y-4"
      >
        {alert ? (
          <FormAlert variant={alert.type} message={alert.message} details={alert.details} />
        ) : null}
        <Card>
          <CardContent className="space-y-4">
            <ToggleField
              control={control}
              name="enabled"
              label="Enable notifications"
              description="Master switch for all in-app alerts."
            />
            <ToggleField
              control={control}
              name="billingAlerts"
              label="Billing alerts"
              description="Overdue invoices and billing anomalies."
            />
            <ToggleField
              control={control}
              name="recommendationAlerts"
              label="Recommendation alerts"
              description="New recommendations from your AI Assistant."
            />
            <ToggleField
              control={control}
              name="usageAlerts"
              label="Usage & spend alerts"
              description="High-spend concentration and usage changes."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="notif-high-spend"
                label="High-spend threshold (%)"
                helper="Flag a platform once it exceeds this share of spend."
                inputMode="numeric"
                error={errors.highSpendThreshold?.message}
                {...register("highSpendThreshold", { valueAsNumber: true })}
              />
            </div>
            <TextField
              id="notif-slack-webhook"
              label="Slack webhook URL (optional — only needed if you haven't connected Slack below)"
              helper="If you've connected Slack via &quot;Add to Slack&quot; above, alerts already post there automatically — no need to fill this in. This is a fallback: create a webhook yourself in Slack (Apps → Incoming Webhooks) and paste it here instead."
              placeholder="https://hooks.slack.com/services/..."
              error={errors.slackWebhookUrl?.message}
              {...register("slackWebhookUrl")}
            />
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </form>
      <SlackChatConnect />
    </div>
  );
}

type SlackStatusView = "loading" | "error" | "not-connected" | "connected";
type CodeStatus = "idle" | "loading" | "ready";

/**
 * Two-step Slack integration, matching how this app is actually sold (each
 * customer organization connects its OWN separate Slack workspace, never a
 * shared one — see backend organization.model.ts's `slackWorkspace`):
 *  1. "Add to Slack" — a workspace admin installs the app into their own
 *     workspace via Slack's own OAuth consent screen (full-page redirect,
 *     same pattern as Stripe Checkout).
 *  2. Once installed, any teammate links their OWN Slack identity with a
 *     short-lived code, DMed to the bot — separate from step 1, since
 *     "the org connected Slack" and "this specific person can chat with it"
 *     are different facts.
 */
function SlackChatConnect() {
  const searchParams = useSearchParams();
  const [view, setView] = React.useState<SlackStatusView>("loading");
  const [teamName, setTeamName] = React.useState<string | null>(null);
  const [alert, setAlert] = useAlertState();
  const [installing, setInstalling] = React.useState(false);
  const [codeStatus, setCodeStatus] = React.useState<CodeStatus>("idle");
  const [code, setCode] = React.useState("");
  const [expiresInMinutes, setExpiresInMinutes] = React.useState(0);

  // Slack redirects back here with ?slack=connected|error after the admin
  // approves (or backs out of) the "Add to Slack" consent screen — folded
  // into the SAME fetch effect (rather than a separate one reacting to
  // `slackResult`) because two setState calls in one synchronous effect
  // body trigger react-hooks/set-state-in-effect's cascading-render check;
  // doing the second one (the alert) inside this async continuation, after
  // the real status fetch, avoids that while still only ever fetching once
  // per mount/redirect.
  const slackResult = searchParams.get("slack");

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      if (slackResult === "error") {
        if (!ignore) setAlert({ type: "error", message: "Could not connect Slack — please try again." });
        return;
      }
      try {
        const response = await getSlackStatus();
        if (ignore) return;
        setTeamName(response.data.teamName);
        setView(response.data.connected ? "connected" : "not-connected");
        if (slackResult === "connected") {
          setAlert({ type: "success", message: "Slack connected!" });
        }
      } catch {
        if (!ignore) setView("error");
      }
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slackResult]);

  const handleInstall = async () => {
    setInstalling(true);
    setAlert(null);
    try {
      const response = await getSlackInstallUrl();
      window.location.href = response.data.url;
    } catch (err) {
      setAlert({
        type: "error",
        message: err instanceof ApiError ? err.message : "Could not start the Slack install.",
      });
      setInstalling(false);
    }
  };

  const handleGenerateCode = async () => {
    setCodeStatus("loading");
    setAlert(null);
    try {
      const response = await createSlackLinkCode();
      setCode(response.data.code);
      setExpiresInMinutes(response.data.expiresInMinutes);
      setCodeStatus("ready");
    } catch (err) {
      setAlert({
        type: "error",
        message: err instanceof ApiError ? err.message : "Something went wrong.",
      });
      setCodeStatus("idle");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat with the Billing Advisor on Slack</CardTitle>
        <CardDescription>
          {view === "connected"
            ? `Connected to ${teamName ?? "your Slack workspace"}. Link your own account below, then DM the bot anytime to chat with your Billing Advisor Agent — same conversation as the in-app chat.`
            : "Connect your organization's Slack workspace, then link your own account to chat with the Billing Advisor Agent from a Slack DM."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}

        {view === "loading" ? (
          <LoadingSpinner label="Checking Slack connection…" />
        ) : view === "error" ? (
          <p className="text-sm text-destructive">Couldn&apos;t check your Slack connection.</p>
        ) : view === "not-connected" ? (
          <Button type="button" disabled={installing} onClick={() => void handleInstall()}>
            {installing ? <Loader2 className="animate-spin" /> : null}
            Add to Slack
          </Button>
        ) : (
          <>
            {codeStatus === "ready" ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Send this code to the bot in a Slack DM within {expiresInMinutes} minutes:
                </p>
                <p className="rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-widest">
                  {code}
                </p>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={codeStatus === "loading"}
              onClick={() => void handleGenerateCode()}
            >
              {codeStatus === "loading" ? <Loader2 className="animate-spin" /> : null}
              {codeStatus === "ready" ? "Generate a new code" : "Link my Slack account"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
