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
import { ApiError } from "@/services/api/client";
import {
  getUserSettings,
  updateUserSettings,
} from "@/services/settings/settings.service";
import { toUserSettings } from "@/services/types/settings";
import { TextField, ToggleField } from "@/components/settings/settings-fields";

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
});
type NotificationsFormValues = z.infer<typeof notificationsFormSchema>;

type ViewStatus = "loading" | "error" | "ready";

/** Which automated alerts the user receives. */
export function NotificationsSettingsTab() {
  const [status, setStatus] = React.useState<ViewStatus>("loading");
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
  });

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getUserSettings();
        if (ignore) return;
        const groups = toUserSettings(response.data.settings);
        reset(groups.notifications);
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
