"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatDate } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import type { BillingRecord } from "@/services/types/billing";
import { BillingStatusBadge } from "./billing-status-badge";

interface BillingTableProps {
  records: BillingRecord[];
  onEdit: (record: BillingRecord) => void;
  onDelete: (record: BillingRecord) => void;
}

/** A professional, scannable data table for billing records — the standard
 *  presentation for financial/invoice data, in place of a card grid. */
export function BillingTable({ records, onEdit, onDelete }: BillingTableProps) {
  const { general } = usePreferences();

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Platform</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/15">
                    {record.platform.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate font-medium text-foreground">
                    {record.platform.name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {record.customerName}
              </TableCell>
              <TableCell className="font-medium text-foreground">
                {record.invoiceNumber}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-foreground">
                {formatMoney(record.amount, record.currency, general)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(record.billingDate, general)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {record.dueDate ? formatDate(record.dueDate, general) : "—"}
              </TableCell>
              <TableCell>
                <BillingStatusBadge status={record.status} />
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit"
                    onClick={() => onEdit(record)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(record)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
