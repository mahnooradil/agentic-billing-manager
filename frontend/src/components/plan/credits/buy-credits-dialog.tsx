"use client";

import * as React from "react";
import { Loader2, ShoppingCart } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import { createCreditsCheckoutSession } from "@/services/credits/credits.service";
import { CREDIT_PACKAGES } from "@/lib/credit-packages";

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Package picker — each option starts a Stripe Checkout session immediately
 *  and redirects there; credits are granted by the backend webhook once
 *  Stripe confirms payment, never optimistically here. */
export function BuyCreditsDialog({ open, onOpenChange }: BuyCreditsDialogProps) {
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // The actual cross-origin navigation happens in the effect below, not
  // here — assigning `window.location.href` directly inside an event
  // handler trips this project's react-hooks/immutability lint rule
  // ("modifying a variable defined outside a component"); deferring it to
  // an effect keyed off this URL is the rule's own suggested pattern.
  const [redirectUrl, setRedirectUrl] = React.useState<string | null>(null);

  const handleBuy = async (packageId: string) => {
    setError(null);
    setLoadingId(packageId);
    try {
      const response = await createCreditsCheckoutSession(packageId);
      setRedirectUrl(response.data.url);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not start checkout. Please try again."
      );
      setLoadingId(null);
    }
  };

  React.useEffect(() => {
    if (redirectUrl) window.location.href = redirectUrl;
  }, [redirectUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buy more credits</DialogTitle>
          <DialogDescription>
            Pick a package — you&apos;ll pay securely on Stripe&apos;s own page, and credits
            land in your balance as soon as payment is confirmed.
          </DialogDescription>
        </DialogHeader>

        {error ? <FormAlert variant="error" message={error} /> : null}

        <div className="space-y-2">
          {CREDIT_PACKAGES.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => void handleBuy(pkg.id)}
              disabled={loadingId !== null}
              className="flex w-full items-center justify-between rounded-lg border border-input px-4 py-3 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              <div>
                <p className="text-sm font-medium">{pkg.credits.toLocaleString()} credits</p>
                <p className="text-xs text-muted-foreground">${pkg.priceUsd} one-time</p>
              </div>
              {loadingId === pkg.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShoppingCart className="size-4 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
