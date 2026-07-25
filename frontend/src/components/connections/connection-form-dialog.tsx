"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

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
  updatePlatformConnection,
} from "@/services/connections/platform-connections.service";
import {
  connectionFormSchema,
  type ConnectionFormValues,
} from "@/lib/validations/platform-connection";
import type { CardMeta } from "@/lib/platform-catalog";
import type { PlatformConnection } from "@/services/types/platform-connections";

interface ConnectionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which platform is being connected/edited. */
  platform: CardMeta;
  /** null → connect (create); a connection → rename/update. */
  connection: PlatformConnection | null;
  onSaved: (message: string) => void;
}

function toFormValues(
  platform: CardMeta,
  connection: PlatformConnection | null
): ConnectionFormValues {
  return {
    displayName: connection?.displayName ?? platform.label,
  };
}

/**
 * Connect / Rename modal. Connect mode sets up the connection (a name to
 * identify it); edit mode renames it. Reused for both via `connection`.
 */
export function ConnectionFormDialog({
  open,
  onOpenChange,
  platform,
  connection,
  onSaved,
}: ConnectionFormDialogProps) {
  const isEdit = connection !== null;
  const [serverError, setServerError] = React.useState<{
    message: string;
    errors?: string[];
  } | null>(null);

  const values = React.useMemo(
    () => toFormValues(platform, connection),
    [platform, connection]
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionFormSchema),
    values,
  });

  const onSubmit = async (data: ConnectionFormValues) => {
    setServerError(null);
    try {
      const response =
        isEdit && connection
          ? await updatePlatformConnection(connection.id, {
              displayName: data.displayName,
            })
          : await createPlatformConnection({
              platform: platform.key,
              displayName: data.displayName,
            });
      onSaved(
        response.message ??
          (isEdit ? "Connection updated." : `${platform.label} connected.`)
      );
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${platform.label}` : `Connect ${platform.label}`}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Rename your ${platform.label} connection.`
              : `Create a connection profile for ${platform.label} in your workspace and give it a name to recognize it. You can manage or remove it anytime.`}
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
            ) : (
              <p className="text-xs text-muted-foreground">
                The name shown on this connection&apos;s card.
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
              {isEdit ? "Save changes" : "Create connection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
