"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import { deletePlatform } from "@/services/platforms/platform.service";
import type { Platform } from "@/services/types/platform";

interface DeletePlatformDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: Platform | null;
  /** Called after a successful delete with a message to surface. */
  onDeleted: (message: string) => void;
}

/** Confirmation dialog for deleting a platform. */
export function DeletePlatformDialog({
  open,
  onOpenChange,
  platform,
  onDeleted,
}: DeletePlatformDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    if (!platform) return;
    setLoading(true);
    setError(null);
    try {
      const response = await deletePlatform(platform.id);
      onDeleted(response.message ?? "Platform deleted.");
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to delete platform."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete platform?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete{" "}
            <span className="font-medium text-foreground">
              {platform?.name}
            </span>
            . This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <FormAlert variant="error" message={error} /> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
