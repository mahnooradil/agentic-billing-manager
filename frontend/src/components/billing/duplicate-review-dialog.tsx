"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatMoney } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import { ApiError } from "@/services/api/client";
import {
  mergeBillingRecords,
  dismissDuplicateCandidate,
} from "@/services/billing/billing.service";
import type { BillingRecord } from "@/services/types/billing";

interface DuplicateReviewDialogProps {
  /** The row the user clicked the "Possible duplicate" badge on. */
  record: BillingRecord | null;
  /** The other record(s) flagged alongside it in the same candidate group. */
  others: BillingRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful merge or dismiss, so the parent can reload. */
  onResolved: (message: string) => void;
}

/** WP-5's "duplicate flags with a merge action" (flow/08 §6) — lets the user
 *  compare `record` against the other candidate(s) in its group and either
 *  merge (non-destructive: the other record is hidden + linked, nothing
 *  deleted) or dismiss (say these are genuinely different, not duplicates). */
export function DuplicateReviewDialog({
  record,
  others,
  open,
  onOpenChange,
  onResolved,
}: DuplicateReviewDialogProps) {
  const { general } = usePreferences();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");

  if (!record) return null;

  const handleMerge = async (otherId: string) => {
    setBusyId(otherId);
    setError("");
    try {
      await mergeBillingRecords(record.id, otherId);
      onOpenChange(false);
      onResolved("Merged — the duplicate is now hidden and can be restored anytime.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not merge these records.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async () => {
    setBusyId(record.id);
    setError("");
    try {
      await dismissDuplicateCandidate(record.id);
      onOpenChange(false);
      onResolved("Got it — this won't be flagged as a duplicate again.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this record.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Possible duplicate</DialogTitle>
          <DialogDescription>
            This invoice looks the same as another one — same vendor, amount, and currency, a
            few days apart. Nothing is ever deleted: merging just hides the duplicate and links
            it, and can be undone anytime.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-secondary/40 p-3 text-sm">
            <p className="font-medium text-foreground">{record.platform.name}</p>
            <p className="text-muted-foreground">
              {formatMoney(record.amount, record.currency, general)} ·{" "}
              {formatDate(record.billingDate, general)} · {record.invoiceNumber}
            </p>
          </div>

          {others.map((other) => (
            <div key={other.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-medium text-foreground">{other.platform.name}</p>
                <p className="text-muted-foreground">
                  {formatMoney(other.amount, other.currency, general)} ·{" "}
                  {formatDate(other.billingDate, general)} · {other.invoiceNumber}
                </p>
              </div>
              <Button
                size="sm"
                disabled={busyId !== null}
                onClick={() => void handleMerge(other.id)}
              >
                Merge into this one
              </Button>
            </div>
          ))}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busyId !== null} onClick={() => void handleDismiss()}>
            Not a duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
