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
  createBillingRecord,
  updateBillingRecord,
} from "@/services/billing/billing.service";
import {
  billingFormSchema,
  type BillingFormValues,
} from "@/lib/validations/billing";
import type {
  BillingRecord,
  CreateBillingPayload,
} from "@/services/types/billing";
import type { Platform } from "@/services/types/platform";

interface BillingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create mode; a record → edit mode. */
  record: BillingRecord | null;
  /** Platforms available to attach the record to. */
  platforms: Platform[];
  /** Called after a successful create/update with a message to surface. */
  onSaved: (message: string) => void;
}

/** Converts an ISO date string to the `yyyy-mm-dd` value a date input expects. */
function toDateInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function toFormValues(record: BillingRecord | null): BillingFormValues {
  return {
    platform: record?.platform.id ?? "",
    customerName: record?.customerName ?? "",
    invoiceNumber: record?.invoiceNumber ?? "",
    amount: record ? String(record.amount) : "",
    currency: record?.currency ?? "USD",
    billingDate: toDateInput(record?.billingDate),
    status: record?.status ?? "Pending",
    notes: record?.notes ?? "",
  };
}

/** Create/Edit billing record modal. Reused for both modes (via `record`). */
export function BillingFormDialog({
  open,
  onOpenChange,
  record,
  platforms,
  onSaved,
}: BillingFormDialogProps) {
  const isEdit = record !== null;
  const [serverError, setServerError] = React.useState<{
    message: string;
    errors?: string[];
  } | null>(null);

  const values = React.useMemo(() => toFormValues(record), [record]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<BillingFormValues>({
    resolver: zodResolver(billingFormSchema),
    values,
  });

  const onSubmit = async (data: BillingFormValues) => {
    setServerError(null);

    const payload: CreateBillingPayload = {
      platform: data.platform,
      customerName: data.customerName,
      invoiceNumber: data.invoiceNumber,
      amount: Number(data.amount),
      currency: data.currency,
      billingDate: data.billingDate,
      status: data.status,
      ...(data.notes ? { notes: data.notes } : {}),
    };

    try {
      const response =
        isEdit && record
          ? await updateBillingRecord(record.id, payload)
          : await createBillingRecord(payload);
      onSaved(
        response.message ??
          (isEdit ? "Billing record updated." : "Billing record created.")
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
            {isEdit ? "Edit billing record" : "Create billing record"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this billing record's details."
              : "Add a new invoice for one of your platforms."}
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
            <Label htmlFor="platform">Platform</Label>
            <Controller
              control={control}
              name="platform"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="platform" className="w-full">
                    <SelectValue placeholder="Select a platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((platform) => (
                      <SelectItem key={platform.id} value={platform.id}>
                        {platform.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.platform ? (
              <p className="text-xs text-destructive">
                {errors.platform.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerName">Customer name</Label>
            <Input
              id="customerName"
              placeholder="Acme Inc."
              aria-invalid={Boolean(errors.customerName)}
              {...register("customerName")}
            />
            {errors.customerName ? (
              <p className="text-xs text-destructive">
                {errors.customerName.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiceNumber">Invoice number</Label>
            <Input
              id="invoiceNumber"
              placeholder="INV-0001"
              aria-invalid={Boolean(errors.invoiceNumber)}
              {...register("invoiceNumber")}
            />
            {errors.invoiceNumber ? (
              <p className="text-xs text-destructive">
                {errors.invoiceNumber.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={Boolean(errors.amount)}
                {...register("amount")}
              />
              {errors.amount ? (
                <p className="text-xs text-destructive">
                  {errors.amount.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                placeholder="USD"
                maxLength={3}
                className="uppercase"
                aria-invalid={Boolean(errors.currency)}
                {...register("currency")}
              />
              {errors.currency ? (
                <p className="text-xs text-destructive">
                  {errors.currency.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="billingDate">Billing date</Label>
              <Input
                id="billingDate"
                type="date"
                aria-invalid={Boolean(errors.billingDate)}
                {...register("billingDate")}
              />
              {errors.billingDate ? (
                <p className="text-xs text-destructive">
                  {errors.billingDate.message}
                </p>
              ) : null}
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
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                      <SelectItem value="Overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Optional notes"
              aria-invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
            {errors.notes ? (
              <p className="text-xs text-destructive">{errors.notes.message}</p>
            ) : null}
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
              {isEdit ? "Save changes" : "Create record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
