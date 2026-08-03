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
import { ApiError } from "@/services/api/client";
import {
  getUserSettings,
  updateUserSettings,
} from "@/services/settings/settings.service";
import { preferencesStore } from "@/services/preferences/preferences-store";
import { DATE_FORMATS, LANDING_PAGES, toUserSettings } from "@/services/types/settings";
import { TextField, SelectField } from "@/components/settings/settings-fields";

const DATE_FORMAT_LABELS: Record<(typeof DATE_FORMATS)[number], string> = {
  ISO: "2026-07-22 (ISO)",
  US: "07/22/2026 (US)",
  EU: "22/07/2026 (EU)",
  LONG: "Jul 22, 2026 (Long)",
};

const LANDING_PAGE_LABELS: Record<(typeof LANDING_PAGES)[number], string> = {
  overview: "Dashboard",
  billing: "Billing",
  usage: "Analytics",
};

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Muscat",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const generalFormSchema = z.object({
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code (e.g. USD)"),
  dateFormat: z.enum(DATE_FORMATS),
  timezone: z.string().trim().min(1, "Timezone is required").max(64),
  defaultLandingPage: z.enum(LANDING_PAGES),
});
type GeneralFormValues = z.infer<typeof generalFormSchema>;

type ViewStatus = "loading" | "error" | "ready";

/** Regional formatting used across the app for money and dates. */
export function GeneralSettingsTab() {
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [loadError, setLoadError] = React.useState("");
  const [alert, setAlert] = React.useState<{
    type: "success" | "error";
    message: string;
    details?: string[];
  } | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GeneralFormValues>({ resolver: zodResolver(generalFormSchema) });

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getUserSettings();
        if (ignore) return;
        const groups = toUserSettings(response.data.settings);
        preferencesStore.setSettings(groups);
        reset(groups.general);
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

  const timezoneOptions = React.useMemo(() => {
    const detected = detectedTimezone();
    return Array.from(new Set([detected, ...COMMON_TIMEZONES]));
  }, []);

  const onSubmit = async (data: GeneralFormValues) => {
    setAlert(null);
    try {
      const response = await updateUserSettings({ general: data });
      const groups = toUserSettings(response.data.settings);
      preferencesStore.setSettings(groups);
      setAlert({ type: "success", message: "General settings saved." });
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
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="general-currency"
            label="Default currency"
            helper="3-letter code (e.g. USD). Used as the default on new invoices."
            error={errors.currency?.message}
            placeholder="USD"
            maxLength={3}
            className="uppercase"
            {...register("currency")}
          />
          <SelectField
            control={control}
            name="dateFormat"
            label="Date format"
            helper="How dates are displayed."
            options={DATE_FORMATS.map((v) => ({ value: v, label: DATE_FORMAT_LABELS[v] }))}
          />
          <SelectField
            control={control}
            name="timezone"
            label="Timezone"
            helper="All dates and times are shown in this timezone."
            options={timezoneOptions.map((v) => ({ value: v, label: v }))}
          />
          <SelectField
            control={control}
            name="defaultLandingPage"
            label="Landing page after login"
            helper="The page the app opens to right after you sign in."
            options={LANDING_PAGES.map((v) => ({ value: v, label: LANDING_PAGE_LABELS[v] }))}
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
