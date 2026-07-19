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
import { deleteBillingRecord } from "@/services/billing/billing.service";
import type { BillingRecord } from "@/services/types/billing";

interface DeleteBillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: BillingRecord | null;
  /** Called after a successful delete with a message to surface. */
  onDeleted: (message: string) => void;
}

/** Confirmation dialog for deleting a billing record. */
export function DeleteBillingDialog({
  open,
  onOpenChange,
  record,
  onDeleted,
}: DeleteBillingDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    if (!record) return;
    setLoading(true);
    setError(null);
    try {
      const response = await deleteBillingRecord(record.id);
      onDeleted(response.message ?? "Billing record deleted.");
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to delete billing record."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete billing record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete invoice{" "}
            <span className="font-medium text-foreground">
              {record?.invoiceNumber}
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
