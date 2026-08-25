"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
            description="New recommendations from your Billing Agent."
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
            label="Slack webhook URL (optional)"
            helper="Create one in Slack (Apps → Incoming Webhooks) and paste it here to also post billing alerts to a Slack channel."
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
  );
}
