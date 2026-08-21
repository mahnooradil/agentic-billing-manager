"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Download, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/common/section-header";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import { useAlertState } from "@/hooks/use-alert-state";
import { updateProfile } from "@/services/auth/auth.service";
import { authStore } from "@/services/auth/auth-store";
import {
  exportBillingRecords,
  importBillingRecords,
} from "@/services/billing/billing.service";
import { useAuth } from "@/hooks/use-auth";
import { TextField } from "@/components/settings/settings-fields";
import { DeleteAccountDialog } from "./delete-account-dialog";

const personalFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be at most 100 characters"),
});
type PersonalFormValues = z.infer<typeof personalFormSchema>;

/** Personal identity — the only user-editable profile field is the display
 *  name; email is the passwordless sign-in identity and isn't editable here. */
export function PersonalSettingsTab() {
  const { user } = useAuth();
  const [alert, setAlert] = useAlertState();
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteDialogKey, setDeleteDialogKey] = React.useState(0);
  const [importing, setImporting] = React.useState(false);
  const [importAlert, setImportAlert] = React.useState<{
    type: "success" | "error";
    message: string;
    details?: string[];
  } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PersonalFormValues>({
    resolver: zodResolver(personalFormSchema),
    values: { fullName: user?.fullName ?? "" },
  });

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      await exportBillingRecords();
    } catch (error) {
      setExportError(
        error instanceof ApiError ? error.message : "Failed to export your data."
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setImportAlert(null);
    setImporting(true);
    try {
      const result = await importBillingRecords(file);
      const summary = `Imported ${result.imported} record${result.imported === 1 ? "" : "s"}.`;
      if (result.failed > 0) {
        setImportAlert({
          type: "error",
          message: `${summary} ${result.failed} row${result.failed === 1 ? "" : "s"} failed.`,
          details: result.errors.map((err) => `Row ${err.row}: ${err.message}`),
        });
      } else {
        setImportAlert({ type: "success", message: summary });
      }
    } catch (error) {
      setImportAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Failed to import the file.",
      });
    } finally {
      setImporting(false);
    }
  };

  const onSubmit = async (data: PersonalFormValues) => {
    setAlert(null);
    try {
      const response = await updateProfile(data);
      authStore.updateUser(response.data.user);
      setAlert({ type: "success", message: "Profile updated." });
    } catch (error) {
      setAlert(
        error instanceof ApiError
          ? { type: "error", message: error.message, details: error.errors }
          : { type: "error", message: "Something went wrong." }
      );
    }
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        noValidate
        className="space-y-4"
      >
        {alert ? (
          <FormAlert variant={alert.type} message={alert.message} details={alert.details} />
        ) : null}
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="personal-fullname"
              label="Full name"
              helper="Shown across the app (greetings, account menu)."
              placeholder="Ada Lovelace"
              error={errors.fullName?.message}
              {...register("fullName")}
            />
            <div className="space-y-2">
              <Label htmlFor="personal-email">Email</Label>
              <p
                id="personal-email"
                className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground"
              >
                {user?.email}
              </p>
              <p className="text-xs text-muted-foreground">
                Your sign-in email — cannot be changed here.
              </p>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </form>

      <section className="space-y-4">
        <SectionHeader
          title="Your data"
          description="Download or bulk-add your billing records."
        />
        {exportError ? <FormAlert variant="error" message={exportError} /> : null}
        {importAlert ? (
          <FormAlert
            variant={importAlert.type}
            message={importAlert.message}
            details={importAlert.details}
          />
        ) : null}
        <Card className="divide-y p-0">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium">Export billing records</p>
              <p className="text-xs text-muted-foreground">
                Downloads a CSV of every invoice in your account.
              </p>
            </div>
            <Button variant="outline" onClick={() => void handleExport()} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              Export CSV
            </Button>
          </CardContent>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium">Import billing records</p>
              <p className="text-xs text-muted-foreground">
                Upload a CSV in the same format as the export — the platform
                column must match a platform you&apos;ve already added.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleFileSelected(e)}
            />
            <Button variant="outline" onClick={handleImportClick} disabled={importing}>
              {importing ? <Loader2 className="animate-spin" /> : <Upload />}
              Import CSV
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Danger zone" description="Irreversible account actions." />
        <Card className="border-destructive/30">
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Delete account</p>
              <p className="text-xs text-muted-foreground">
                Permanently deletes your account and all your data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteDialogKey((key) => key + 1);
                setDeleteOpen(true);
              }}
            >
              Delete account
            </Button>
          </CardContent>
        </Card>
      </section>

      <DeleteAccountDialog
        key={`delete-account-${deleteDialogKey}`}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
