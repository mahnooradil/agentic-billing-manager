"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/common/error-state";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SectionHeader } from "@/components/common/section-header";
import { ApiError } from "@/services/api/client";
import {
  getAiSettings,
  upsertAiSettings,
} from "@/services/ai/ai-settings.service";
import {
  aiSettingsFormSchema,
  AI_PROVIDERS,
  type AiSettingsFormValues,
} from "@/lib/validations/ai-settings";
import type { AiSettings } from "@/services/types/ai";

type ViewStatus = "loading" | "error" | "ready";

/** Result of an imperative save, consumed by the parent Settings view. */
export interface AiSaveResult {
  ok: boolean;
  /** True when there were no AI changes to persist (nothing was sent). */
  skipped?: boolean;
  error?: { message: string; details?: string[] };
}

/** Imperative handle so the single parent "Save changes" persists AI settings too. */
export interface AiSettingsHandle {
  save: () => Promise<AiSaveResult>;
}

function toFormValues(settings: AiSettings | null): AiSettingsFormValues {
  return {
    provider: settings?.provider ?? "OpenAI",
    model: settings?.model ?? "",
    // Never prefill the key — it is write-only and masked when configured.
    apiKey: "",
    // Generation controls are held as strings; blank = provider default.
    temperature: settings?.temperature != null ? String(settings.temperature) : "",
    maxTokens: settings?.maxTokens != null ? String(settings.maxTokens) : "",
  };
}

/**
 * AI provider configuration section (provider, model, encrypted API key, and the
 * generation controls temperature + max tokens). It loads and masks the stored
 * key and validates its own fields, but it has NO own submit button: saving is
 * driven by the parent Settings view through the imperative `save()` handle, so a
 * single "Save changes" persists BOTH the AI settings (→ /ai/settings) and the
 * general preferences (→ /settings). This eliminates the earlier defect where
 * editing temperature/max tokens and clicking the global Save silently dropped
 * them.
 */
export const AiSettingsForm = React.forwardRef<AiSettingsHandle>(
  function AiSettingsForm(_props, ref) {
    const [status, setStatus] = React.useState<ViewStatus>("loading");
    const [settings, setSettings] = React.useState<AiSettings | null>(null);
    const [loadError, setLoadError] = React.useState("");

    // Bumping reloadKey re-runs the fetch effect — the single source of loading.
    const [reloadKey, setReloadKey] = React.useState(0);
    const reload = () => setReloadKey((key) => key + 1);

    React.useEffect(() => {
      let ignore = false;
      (async () => {
        try {
          const response = await getAiSettings();
          if (ignore) return;
          setSettings(response.data.settings);
          setStatus("ready");
        } catch (error) {
          if (ignore) return;
          setLoadError(
            error instanceof ApiError
              ? error.message
              : "Failed to load AI settings."
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
      setError,
      formState: { errors, isDirty },
    } = useForm<AiSettingsFormValues>({
      resolver: zodResolver(aiSettingsFormSchema),
      values,
    });

    const isConfigured = settings !== null;

    /** Persists the validated AI settings; returns a structured result. */
    const performSave = async (
      data: AiSettingsFormValues
    ): Promise<AiSaveResult> => {
      // A key is mandatory the first time a configuration is created.
      if (!isConfigured && !data.apiKey) {
        setError("apiKey", { message: "API key is required" });
        return { ok: false, error: { message: "AI provider: API key is required." } };
      }

      try {
        const response = await upsertAiSettings({
          provider: data.provider,
          model: data.model,
          ...(data.apiKey ? { apiKey: data.apiKey } : {}),
          // Blank clears the value (null → provider default); a value sets it.
          temperature: data.temperature === "" ? null : Number(data.temperature),
          maxTokens: data.maxTokens === "" ? null : Number(data.maxTokens),
        });
        setSettings(response.data.settings);
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            ok: false,
            error: { message: `AI provider: ${error.message}`, details: error.errors },
          };
        }
        return { ok: false, error: { message: "AI provider: something went wrong." } };
      }
    };

    // Expose save() to the parent. Skips when the section isn't ready or has no
    // changes, so saving preferences alone never re-writes or blocks on AI.
    React.useImperativeHandle(
      ref,
      () => ({
        save: () =>
          new Promise<AiSaveResult>((resolve) => {
            if (status !== "ready" || !isDirty) {
              resolve({ ok: true, skipped: true });
              return;
            }
            void handleSubmit(
              async (data) => resolve(await performSave(data)),
              () =>
                resolve({
                  ok: false,
                  error: { message: "AI provider: please fix the highlighted fields." },
                })
            )();
          }),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [status, isDirty, isConfigured, handleSubmit]
    );

    return (
      <section className="space-y-4">
        <SectionHeader
          title="AI Provider"
          description="Configure the AI provider used for insights. Your API key is encrypted at rest and never shown again. Changes are saved with the Save button at the bottom."
        />
        <Card>
          <CardContent>
            {status === "loading" ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner label="Loading AI settings…" />
              </div>
            ) : status === "error" ? (
              <ErrorState description={loadError} onRetry={retry} />
            ) : (
              // Not a <form> element: this section is rendered inside the parent
              // SettingsView <form> (nested forms are invalid). It validates its
              // own fields; the parent's Save persists it via the save() handle.
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ai-provider">Provider</Label>
                    <Controller
                      control={control}
                      name="provider"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="ai-provider" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AI_PROVIDERS.map((provider) => (
                              <SelectItem key={provider} value={provider}>
                                {provider}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-model">Model name</Label>
                    <Input
                      id="ai-model"
                      placeholder="e.g. gpt-4o, gemini-1.5-pro"
                      aria-invalid={Boolean(errors.model)}
                      {...register("model")}
                    />
                    {errors.model ? (
                      <p className="text-xs text-destructive">
                        {errors.model.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-api-key">API key</Label>
                  <Input
                    id="ai-api-key"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      isConfigured
                        ? "Enter a new key to replace the current one"
                        : "Enter your provider API key"
                    }
                    aria-invalid={Boolean(errors.apiKey)}
                    {...register("apiKey")}
                  />
                  {errors.apiKey ? (
                    <p className="text-xs text-destructive">
                      {errors.apiKey.message}
                    </p>
                  ) : isConfigured ? (
                    <p className="text-xs text-muted-foreground">
                      Current key: {settings.maskedApiKey} — leave blank to keep it.
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ai-temperature">Temperature</Label>
                    <Input
                      id="ai-temperature"
                      inputMode="decimal"
                      placeholder="Provider default"
                      aria-invalid={Boolean(errors.temperature)}
                      {...register("temperature")}
                    />
                    {errors.temperature ? (
                      <p className="text-xs text-destructive">
                        {errors.temperature.message}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        0–2. Blank uses the provider default.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-max-tokens">Max tokens</Label>
                    <Input
                      id="ai-max-tokens"
                      inputMode="numeric"
                      placeholder="Provider default"
                      aria-invalid={Boolean(errors.maxTokens)}
                      {...register("maxTokens")}
                    />
                    {errors.maxTokens ? (
                      <p className="text-xs text-destructive">
                        {errors.maxTokens.message}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Max reply length. Blank uses the provider default.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    );
  }
);
