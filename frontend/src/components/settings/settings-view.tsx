"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { ErrorState } from "@/components/common/error-state";
import {
  AiSettingsForm,
  type AiSettingsHandle,
} from "@/components/ai/ai-settings-form";
import { ApiError } from "@/services/api/client";
import {
  getUserSettings,
  updateUserSettings,
} from "@/services/settings/settings.service";
import { preferencesStore } from "@/services/preferences/preferences-store";
import {
  DATE_FORMATS,
  SETTINGS_ANALYTICS_RANGES,
  RECOMMENDATION_FOCUSES,
  THEMES,
  DEFAULT_USER_SETTINGS,
  toUserSettings,
  type UserSettings,
  type Theme,
} from "@/services/types/settings";
import {
  settingsFormSchema,
  type SettingsFormValues,
} from "@/lib/validations/settings";

type ViewStatus = "loading" | "error" | "ready";

// ── Human labels for the enum options ──
const DATE_FORMAT_LABELS: Record<(typeof DATE_FORMATS)[number], string> = {
  ISO: "2026-07-22 (ISO)",
  US: "07/22/2026 (US)",
  EU: "22/07/2026 (EU)",
  LONG: "Jul 22, 2026 (Long)",
};

const RANGE_LABELS: Record<(typeof SETTINGS_ANALYTICS_RANGES)[number], string> = {
  all: "All time",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
};

const FOCUS_LABELS: Record<(typeof RECOMMENDATION_FOCUSES)[number], string> = {
  all: "All areas",
  overdue: "Overdue invoices",
  spend: "Spending",
};

const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

// A curated timezone list plus the browser's detected zone (deduped).
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

function toFormValues(settings: UserSettings): SettingsFormValues {
  // Appearance (theme) is managed via next-themes; `language` persists in the
  // model but has no UI control (no real localization yet), so it is not part of
  // the form — the backend keeps its stored value on save.
  return {
    general: {
      currency: settings.general.currency,
      dateFormat: settings.general.dateFormat,
      timezone: settings.general.timezone,
    },
    notifications: settings.notifications,
    analytics: settings.analytics,
    automation: settings.automation,
    memory: settings.memory,
    recommendations: settings.recommendations,
    workspace: settings.workspace,
  };
}

/**
 * Complete, production settings module (Phase F7). Loads the user's persistent
 * preferences and renders professional grouped sections (General, AI,
 * Notifications, Analytics, Automation, Memory, Recommendations, Workspace,
 * Appearance). One Save persists every group via PUT /settings (deep-merged);
 * theme applies instantly via next-themes and is persisted alongside. The AI
 * provider/key/generation controls remain in the dedicated `AiSettingsForm`.
 */
export function SettingsView() {
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [settings, setSettings] = React.useState<UserSettings>(
    DEFAULT_USER_SETTINGS
  );
  const [loadError, setLoadError] = React.useState("");
  const [alert, setAlert] = React.useState<{
    type: "success" | "error";
    message: string;
    details?: string[];
  } | null>(null);

  const { theme, setTheme } = useTheme();
  // Lets the single "Save changes" persist the AI section too (one Save for all).
  const aiRef = React.useRef<AiSettingsHandle>(null);

  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getUserSettings();
        if (ignore) return;
        const groups = toUserSettings(response.data.settings);
        setSettings(groups);
        preferencesStore.setSettings(groups);
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
  }, [reloadKey]);

  const retry = () => {
    setStatus("loading");
    reload();
  };

  const values = React.useMemo(() => toFormValues(settings), [settings]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    values,
  });

  const timezoneOptions = React.useMemo(() => {
    const detected = detectedTimezone();
    return Array.from(new Set([detected, ...COMMON_TIMEZONES]));
  }, []);

  const onSubmit = async (data: SettingsFormValues) => {
    setAlert(null);

    // 1. Persist the AI section (provider/model/key/temperature/max tokens) via
    //    its own /ai/settings endpoint. Skips cleanly when the AI form is
    //    unchanged, so preferences-only saves never touch it.
    const aiResult = (await aiRef.current?.save()) ?? { ok: true, skipped: true };

    // 2. Persist the general preferences (+ theme) via /settings.
    let prefsError: { message: string; details?: string[] } | null = null;
    try {
      const nextTheme: Theme = (THEMES as readonly string[]).includes(
        theme ?? ""
      )
        ? (theme as Theme)
        : "system";

      const response = await updateUserSettings({
        ...data,
        appearance: { theme: nextTheme },
      });
      const groups = toUserSettings(response.data.settings);
      setSettings(groups);
      preferencesStore.setSettings(groups);
    } catch (error) {
      prefsError =
        error instanceof ApiError
          ? { message: `Preferences: ${error.message}`, details: error.errors }
          : { message: "Preferences: something went wrong." };
    }

    // 3. Combine both outcomes into a single message.
    if (aiResult.ok && !prefsError) {
      setAlert({ type: "success", message: "Settings saved." });
    } else {
      const details: string[] = [];
      if (!aiResult.ok && aiResult.error) {
        details.push(aiResult.error.message);
        if (aiResult.error.details) details.push(...aiResult.error.details);
      }
      if (prefsError) {
        details.push(prefsError.message);
        if (prefsError.details) details.push(...prefsError.details);
      }
      setAlert({
        type: "error",
        message: "Some settings could not be saved.",
        details,
      });
    }
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Settings"
        description="Manage your workspace, AI, and application preferences."
      />

      {status === "loading" ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner label="Loading settings…" />
        </div>
      ) : status === "error" ? (
        <ErrorState description={loadError} onRetry={retry} />
      ) : (
        <>
          {alert ? (
            <FormAlert
              variant={alert.type}
              message={alert.message}
              details={alert.details}
            />
          ) : null}

          <form
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            noValidate
            className="reveal-group space-y-8"
          >
            {/* ── General ── */}
            <SettingsSection
              title="General"
              description="Regional formatting used across the app for money and dates."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="general-currency"
                  label="Default currency"
                  helper="3-letter code (e.g. USD). Used as the default on new invoices."
                  error={errors.general?.currency?.message}
                  placeholder="USD"
                  maxLength={3}
                  className="uppercase"
                  {...register("general.currency")}
                />
                <SelectField
                  control={control}
                  name="general.dateFormat"
                  label="Date format"
                  helper="How dates are displayed."
                  options={DATE_FORMATS.map((v) => ({
                    value: v,
                    label: DATE_FORMAT_LABELS[v],
                  }))}
                />
                <SelectField
                  control={control}
                  name="general.timezone"
                  label="Timezone"
                  helper="All dates and times are shown in this timezone."
                  options={timezoneOptions.map((v) => ({ value: v, label: v }))}
                />
              </div>
            </SettingsSection>

            {/* ── AI Provider (provider, key, model, temp, tokens) — saved by the
                 shared "Save changes" below via the imperative handle. ── */}
            <AiSettingsForm ref={aiRef} />

            {/* ── Notifications ── */}
            <SettingsSection
              title="Notifications"
              description="Choose which automated alerts you receive."
            >
              <ToggleField
                control={control}
                name="notifications.enabled"
                label="Enable notifications"
                description="Master switch for all in-app alerts."
              />
              <ToggleField
                control={control}
                name="notifications.billingAlerts"
                label="Billing alerts"
                description="Overdue invoices and billing anomalies."
              />
              <ToggleField
                control={control}
                name="notifications.recommendationAlerts"
                label="Recommendation alerts"
                description="New AI recommendations for your account."
              />
              <ToggleField
                control={control}
                name="notifications.usageAlerts"
                label="Usage & spend alerts"
                description="High-spend concentration and usage changes."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="notif-high-spend"
                  label="High-spend threshold (%)"
                  helper="Flag a platform once it exceeds this share of spend."
                  inputMode="numeric"
                  error={errors.notifications?.highSpendThreshold?.message}
                  {...register("notifications.highSpendThreshold", {
                    valueAsNumber: true,
                  })}
                />
              </div>
            </SettingsSection>

            {/* ── Analytics ── */}
            <SettingsSection
              title="Analytics"
              description="Defaults and thresholds for the analytics dashboard."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  control={control}
                  name="analytics.defaultRange"
                  label="Default time range"
                  helper="The range analytics opens with."
                  options={SETTINGS_ANALYTICS_RANGES.map((v) => ({
                    value: v,
                    label: RANGE_LABELS[v],
                  }))}
                />
                <TextField
                  id="an-trend-months"
                  label="Trend window (months)"
                  helper="How many months the trend chart spans."
                  inputMode="numeric"
                  error={errors.analytics?.trendMonths?.message}
                  {...register("analytics.trendMonths", { valueAsNumber: true })}
                />
                <TextField
                  id="an-concentration"
                  label="Concentration threshold (%)"
                  helper="Spend-concentration insight trigger."
                  inputMode="numeric"
                  error={errors.analytics?.concentrationThreshold?.message}
                  {...register("analytics.concentrationThreshold", {
                    valueAsNumber: true,
                  })}
                />
                <TextField
                  id="an-high-cost"
                  label="High-cost threshold (%)"
                  helper="Marks platforms as high-cost above this share."
                  inputMode="numeric"
                  error={errors.analytics?.highCostThreshold?.message}
                  {...register("analytics.highCostThreshold", {
                    valueAsNumber: true,
                  })}
                />
                <TextField
                  id="an-growth"
                  label="Growth alert threshold (%)"
                  helper="Month-over-month growth that raises a flag."
                  inputMode="numeric"
                  error={errors.analytics?.growthAlertThreshold?.message}
                  {...register("analytics.growthAlertThreshold", {
                    valueAsNumber: true,
                  })}
                />
              </div>
            </SettingsSection>

            {/* ── Automation ── */}
            <SettingsSection
              title="Automation"
              description="Control the autonomous automation engine."
            >
              <ToggleField
                control={control}
                name="automation.enabled"
                label="Enable automation"
                description="Generate automation tasks from recommendations."
              />
              <ToggleField
                control={control}
                name="automation.autoApprove"
                label="Auto-approve tasks"
                description="Approve generated tasks without manual review."
              />
            </SettingsSection>

            {/* ── Memory ── */}
            <SettingsSection
              title="AI Memory"
              description="How much conversation context the assistant retains."
            >
              <ToggleField
                control={control}
                name="memory.enabled"
                label="Enable conversation memory"
                description="Let the assistant remember earlier turns."
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  id="mem-recall"
                  label="Max recall"
                  helper="Recent messages injected as context."
                  inputMode="numeric"
                  error={errors.memory?.maxRecall?.message}
                  {...register("memory.maxRecall", { valueAsNumber: true })}
                />
                <TextField
                  id="mem-summarize"
                  label="Summarize after"
                  helper="Compact memory past this many messages."
                  inputMode="numeric"
                  error={errors.memory?.summarizeTrigger?.message}
                  {...register("memory.summarizeTrigger", {
                    valueAsNumber: true,
                  })}
                />
                <TextField
                  id="mem-keep"
                  label="Keep recent"
                  helper="Messages kept verbatim after compaction."
                  inputMode="numeric"
                  error={errors.memory?.keepRecent?.message}
                  {...register("memory.keepRecent", { valueAsNumber: true })}
                />
              </div>
            </SettingsSection>

            {/* ── Recommendations ── */}
            <SettingsSection
              title="Recommendations"
              description="Tune the AI recommendation engine."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="rec-max"
                  label="Max recommendations"
                  helper="How many recommendations to surface."
                  inputMode="numeric"
                  error={errors.recommendations?.maxCount?.message}
                  {...register("recommendations.maxCount", {
                    valueAsNumber: true,
                  })}
                />
                <SelectField
                  control={control}
                  name="recommendations.defaultFocus"
                  label="Default focus"
                  helper="Where recommendations concentrate."
                  options={RECOMMENDATION_FOCUSES.map((v) => ({
                    value: v,
                    label: FOCUS_LABELS[v],
                  }))}
                />
              </div>
            </SettingsSection>

            {/* ── Workspace ── */}
            <SettingsSection
              title="Workspace"
              description="Personalize your workspace."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="ws-display-name"
                  label="Display name"
                  helper="Shown in greetings and summaries."
                  placeholder="Ada Lovelace"
                  error={errors.workspace?.displayName?.message}
                  {...register("workspace.displayName")}
                />
              </div>
            </SettingsSection>

            {/* ── Appearance (managed via next-themes; persisted on save) ── */}
            <SettingsSection
              title="Appearance"
              description="Choose how the interface looks. Applies instantly."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="appearance-theme">Theme</Label>
                  <Select
                    value={theme ?? "system"}
                    onValueChange={(value) => setTheme(value ?? "system")}
                  >
                    <SelectTrigger id="appearance-theme" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {THEMES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {THEME_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Saved to your account when you save settings.
                  </p>
                </div>
              </div>
            </SettingsSection>

            {/* Sticky save bar. */}
            <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-3 border-t bg-background/80 px-1 py-4 backdrop-blur">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </form>
        </>
      )}
    </PageWrapper>
  );
}

// ── Presentational helpers ──

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <SectionHeader title={title} description={description} />
      <Card>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </section>
  );
}

interface TextFieldProps extends React.ComponentProps<typeof Input> {
  label: string;
  helper?: string;
  error?: string;
}

/** Labelled text/number input that forwards the RHF register ref. */
const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ label, helper, error, id, ...props }, ref) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} ref={ref} aria-invalid={Boolean(error)} {...props} />
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : helper ? (
          <p className="text-xs text-muted-foreground">{helper}</p>
        ) : null}
      </div>
    );
  }
);

/* eslint-disable @typescript-eslint/no-explicit-any */
function SelectField({
  control,
  name,
  label,
  helper,
  options,
}: {
  control: any;
  name: string;
  label: string;
  helper?: string;
  options: { value: string; label: string }[];
}) {
  const fieldId = `field-${name.replace(/\./g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={fieldId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function ToggleField({
  control,
  name,
  label,
  description,
}: {
  control: any;
  name: string;
  label: string;
  description: string;
}) {
  const fieldId = `toggle-${name.replace(/\./g, "-")}`;
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={fieldId} className="cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch
            id={fieldId}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        )}
      />
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
