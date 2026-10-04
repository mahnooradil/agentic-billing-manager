"use client";

import { Mail, ShieldCheck } from "lucide-react";

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
import type { PipedreamConnectTarget } from "@/hooks/use-pipedream-connect";

interface EmailPrivacyConsentDialogProps {
  app: PipedreamConnectTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

/**
 * WP-12 (flow/03 Sec7: "no privacy copy at the OAuth consent moment") — a
 * plain-language explanation shown BEFORE the real Google/Microsoft consent
 * popup opens, not a replacement for it (Google/Microsoft's own screen still
 * shows the actual requested scopes — this is the one place *this app*
 * explains, in its own words, what it does with that access). The real
 * read-only vs. read-write distinction already exists one layer down — see
 * `gmail-provider.ts`'s scope handling — this dialog is purely explanatory,
 * it doesn't change what gets requested.
 */
export function EmailPrivacyConsentDialog({
  app,
  open,
  onOpenChange,
  onContinue,
}: EmailPrivacyConsentDialogProps) {
  if (!app) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            Connecting {app.name}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-left">
            <p>
              You&apos;re about to sign in to {app.name} and allow this app to scan your inbox
              for invoice, receipt, and billing emails.
            </p>
            <div className="flex items-start gap-2 rounded-md bg-secondary p-3 text-secondary-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <ul className="list-inside list-disc space-y-1 text-xs">
                <li>We only read emails that look like invoices or receipts.</li>
                <li>We never send, delete, or modify anything in your inbox.</li>
                <li>Your email credentials are never seen or stored by this app.</li>
                <li>You can disconnect at any time from this page.</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              The next screen is {app.name}&apos;s own sign-in page — it will show you exactly
              which permissions are being requested before you approve anything.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>Continue to {app.name}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
