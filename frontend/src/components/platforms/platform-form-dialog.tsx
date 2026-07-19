"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import {
  createPlatform,
  updatePlatform,
} from "@/services/platforms/platform.service";
import {
  platformFormSchema,
  type PlatformFormValues,
} from "@/lib/validations/platform";
import type { CreatePlatformPayload, Platform } from "@/services/types/platform";

interface PlatformFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create mode; a platform → edit mode. */
  platform: Platform | null;
  /** Called after a successful create/update with a message to surface. */
  onSaved: (message: string) => void;
}

function toFormValues(platform: Platform | null): PlatformFormValues {
  return {
    name: platform?.name ?? "",
    slug: platform?.slug ?? "",
    description: platform?.description ?? "",
    website: platform?.website ?? "",
    logo: platform?.logo ?? "",
    status: platform?.status ?? "Active",
  };
}

/** Create/Edit platform modal. Reused for both modes (via the `platform` prop). */
export function PlatformFormDialog({
  open,
  onOpenChange,
  platform,
  onSaved,
}: PlatformFormDialogProps) {
  const isEdit = platform !== null;
  const [serverError, setServerError] = React.useState<{
    message: string;
    errors?: string[];
  } | null>(null);

  const values = React.useMemo(() => toFormValues(platform), [platform]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PlatformFormValues>({
    resolver: zodResolver(platformFormSchema),
    values,
  });

  const onSubmit = async (data: PlatformFormValues) => {
    setServerError(null);

    // Only send optional fields that actually have a value.
    const payload: CreatePlatformPayload = {
      name: data.name,
      slug: data.slug,
      status: data.status,
      ...(data.description ? { description: data.description } : {}),
      ...(data.website ? { website: data.website } : {}),
      ...(data.logo ? { logo: data.logo } : {}),
    };

    try {
      const response =
        isEdit && platform
          ? await updatePlatform(platform.id, payload)
          : await createPlatform(payload);
      onSaved(
        response.message ?? (isEdit ? "Platform updated." : "Platform created.")
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
          <DialogTitle>{isEdit ? "Edit platform" : "Create platform"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this platform's details."
              : "Add a new platform to manage."}
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
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Stripe"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              placeholder="stripe"
              aria-invalid={Boolean(errors.slug)}
              {...register("slug")}
            />
            {errors.slug ? (
              <p className="text-xs text-destructive">{errors.slug.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              placeholder="Short description (optional)"
              aria-invalid={Boolean(errors.description)}
              {...register("description")}
            />
            {errors.description ? (
              <p className="text-xs text-destructive">
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://…"
                aria-invalid={Boolean(errors.website)}
                {...register("website")}
              />
              {errors.website ? (
                <p className="text-xs text-destructive">
                  {errors.website.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo">Logo URL</Label>
              <Input
                id="logo"
                placeholder="https://…"
                aria-invalid={Boolean(errors.logo)}
                {...register("logo")}
              />
              {errors.logo ? (
                <p className="text-xs text-destructive">{errors.logo.message}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
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
              {isEdit ? "Save changes" : "Create platform"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
