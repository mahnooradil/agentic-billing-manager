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
import { deletePlatformConnection } from "@/services/connections/platform-connections.service";
import type { PlatformConnection } from "@/services/types/platform-connections";

interface DisconnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: PlatformConnection | null;
  onDisconnected: (message: string) => void;
}

/** Confirmation dialog for disconnecting (removing) a platform connection. */
export function DisconnectDialog({
  open,
  onOpenChange,
  connection,
  onDisconnected,
}: DisconnectDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDisconnect = async () => {
    if (!connection) return;
    setLoading(true);
    setError(null);
    try {
      const response = await deletePlatformConnection(connection.id);
      onDisconnected(response.message ?? "Platform disconnected.");
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to disconnect platform."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect platform?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the connection{" "}
            <span className="font-medium text-foreground">
              {connection?.displayName}
            </span>{" "}
            from your workspace. You can add it again at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <FormAlert variant="error" message={error} /> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDisconnect}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : null}
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
