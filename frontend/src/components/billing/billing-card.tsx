"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney, formatDate } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import type { BillingRecord } from "@/services/types/billing";
import { BillingStatusBadge } from "./billing-status-badge";

interface BillingCardProps {
  record: BillingRecord;
  onEdit: (record: BillingRecord) => void;
  onDelete: (record: BillingRecord) => void;
}

/** Presentational card for a single billing record, with edit/delete actions. */
export function BillingCard({ record, onEdit, onDelete }: BillingCardProps) {
  // Money + date honor the user's General preferences (currency locale, date
  // format, timezone). The record's own currency always wins.
  const { general } = usePreferences();
  return (
    <Card className="hover-lift group flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-105">
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
            {formatMoney(record.amount, record.currency, general)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(record.billingDate, general)}
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
