"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import {
  createPlatformConnection,
  verifyPlatformConnection,
} from "@/services/connections/platform-connections.service";
import {
  apiKeyConnectSchema,
  type ApiKeyConnectValues,
} from "@/lib/validations/platform-connection";
import type { CardMeta } from "@/lib/platform-catalog";
import type { PlatformConnection } from "@/services/types/platform-connections";

interface ConnectApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: CardMeta;
  /** null → first connect; a connection → reconnect (verify a new key). */
  connection: PlatformConnection | null;
  onDone: (message: string) => void;
}

/**
 * API-key connection dialog. The key is sent to the backend, which VERIFIES it
 * against the real provider, encrypts it, and returns the real connection status
 * — nothing is marked connected until verification succeeds. The key is never
 * echoed back. Used for both first connect and reconnect.
 */
export function ConnectApiKeyDialog({
  open,
  onOpenChange,
  platform,
  connection,
  onDone,
}: ConnectApiKeyDialogProps) {
  const isReconnect = connection !== null;
  const [serverError, setServerError] = React.useState<{
    message: string;
    errors?: string[];
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyConnectValues>({
    resolver: zodResolver(apiKeyConnectSchema),
    defaultValues: { displayName: platform.label, apiKey: "" },
  });

  const handleOpenChange = (next: boolean) => {
    if (next) {
      reset({ displayName: connection?.displayName ?? platform.label, apiKey: "" });
      setServerError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = async (data: ApiKeyConnectValues) => {
    setServerError(null);
    try {
      const response =
        isReconnect && connection
          ? await verifyPlatformConnection(connection.id, {
              credential: data.apiKey,
            })
          : await createPlatformConnection({
              platform: platform.key,
              displayName: data.displayName,
              credential: data.apiKey,
            });

      // On reconnect, the endpoint returns 200 even when the new key is invalid
      // (the connection is set to "error"); surface that instead of a false success.
      const result = response.data.connection;
      if (isReconnect && result.status === "error") {
        setServerError({
          message: result.lastError ?? "The provider could not verify this API key.",
        });
        return;
      }

      onDone(response.message ?? `${platform.label} connected.`);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError({ message: error.message, errors: error.errors });
      } else {
        setServerError({ message: "Something went wrong. Please try again." });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isReconnect
              ? `Reconnect ${platform.label}`
              : `Connect ${platform.label}`}
          </DialogTitle>
          <DialogDescription>
            Enter your {platform.label} API key. We verify it with {platform.label}
            , encrypt it at rest, and never show it again.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {serverError ? (
            <FormAlert
              variant="error"
              message={serverError.message}
              details={serverError.errors}
            />
          ) : null}

          {!isReconnect ? (
            <div className="space-y-2">
              <Label htmlFor="conn-display-name">Display name</Label>
              <Input
                id="conn-display-name"
                placeholder={platform.label}
                aria-invalid={Boolean(errors.displayName)}
                {...register("displayName")}
              />
              {errors.displayName ? (
                <p className="text-xs text-destructive">
                  {errors.displayName.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="conn-api-key">API key</Label>
            <Input
              id="conn-api-key"
              type="password"
              autoComplete="off"
              placeholder={
                connection?.hasCredential
                  ? "Enter a new key to reconnect"
                  : "Paste your API key"
              }
              aria-invalid={Boolean(errors.apiKey)}
              {...register("apiKey")}
            />
            {errors.apiKey ? (
              <p className="text-xs text-destructive">{errors.apiKey.message}</p>
            ) : (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                Verified with the provider and encrypted at rest.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {isReconnect ? "Reconnect" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
