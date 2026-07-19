"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { FormAlert } from "@/components/common/form-alert";
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

function toFormValues(settings: AiSettings | null): AiSettingsFormValues {
  return {
    provider: settings?.provider ?? "OpenAI",
    model: settings?.model ?? "",
    // Never prefill the key — it is write-only and masked when configured.
    apiKey: "",
  };
}

/**
 * AI provider configuration section. Loads the current user's settings, lets
 * them create/edit the provider, model and (encrypted) API key, and masks the
 * stored key. Test Connection is a placeholder for a later phase.
 */
export function AiSettingsForm() {
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [settings, setSettings] = React.useState<AiSettings | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [alert, setAlert] = React.useState<{
    type: "success" | "error";
    message: string;
    details?: string[];
  } | null>(null);
  const [testMessage, setTestMessage] = React.useState("");

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
    formState: { errors, isSubmitting },
  } = useForm<AiSettingsFormValues>({
    resolver: zodResolver(aiSettingsFormSchema),
    values,
  });

  const isConfigured = settings !== null;

  const onSubmit = async (data: AiSettingsFormValues) => {
    setAlert(null);
    setTestMessage("");

    // A key is mandatory the first time a configuration is created.
    if (!isConfigured && !data.apiKey) {
      setError("apiKey", { message: "API key is required" });
      return;
    }

    try {
      const response = await upsertAiSettings({
        provider: data.provider,
        model: data.model,
        ...(data.apiKey ? { apiKey: data.apiKey } : {}),
      });
      setSettings(response.data.settings);
      setAlert({
        type: "success",
        message: response.message ?? "AI settings saved.",
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setAlert({ type: "error", message: error.message, details: error.errors });
      } else {
        setAlert({
          type: "error",
          message: "Something went wrong. Please try again.",
        });
      }
    }
  };

  const handleTestConnection = () => {
    setAlert(null);
    setTestMessage("Test connection will be available in an upcoming phase.");
  };

  return (
    <section className="space-y-4">
      <SectionHeader
        title="AI Provider"
        description="Configure the AI provider used for insights. Your API key is encrypted at rest and never shown again."
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
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="space-y-4"
            >
              {alert ? (
                <FormAlert
                  variant={alert.type}
                  message={alert.message}
                  details={alert.details}
                />
              ) : null}

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

              {testMessage ? (
                <p className="text-sm text-muted-foreground">{testMessage}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isSubmitting}
                >
                  Test connection
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
