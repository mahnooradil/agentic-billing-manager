import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BillingRecord } from "@/services/types/billing";
import { BillingStatusBadge } from "./billing-status-badge";

interface BillingCardProps {
  record: BillingRecord;
  onEdit: (record: BillingRecord) => void;
  onDelete: (record: BillingRecord) => void;
}

/** Formats an amount using the record's currency, falling back to a plain code. */
function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Formats an ISO date string as a short, human-readable date. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Presentational card for a single billing record, with edit/delete actions. */
export function BillingCard({ record, onEdit, onDelete }: BillingCardProps) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
            {record.platform.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium">{record.invoiceNumber}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {record.platform.name} · {record.customerName}
            </p>
          </div>
          <BillingStatusBadge status={record.status} />
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold tracking-tight">
            {formatAmount(record.amount, record.currency)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(record.billingDate)}
          </span>
        </div>

        {record.notes ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {record.notes}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(record)}>
          <Pencil />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn("text-destructive hover:text-destructive")}
          onClick={() => onDelete(record)}
        >
          <Trash2 />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}
