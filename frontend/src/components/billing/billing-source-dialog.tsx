"use client";

import { ExternalLink, Mail, RefreshCw, UserPen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import type { BillingRecord } from "@/services/types/billing";
import { isLowConfidence } from "./billing-provenance-badge";

interface BillingSourceDialogProps {
  record: BillingRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SENDER_AUTH_LABEL: Record<"pass" | "fail" | "none", string> = {
  pass: "Passed (SPF/DKIM/DMARC aligned with the From: domain)",
  fail: "Failed — this email's sender authentication did not pass",
  none: "No authentication result available (common for smaller senders)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

/**
 * WP-5 (CLAUDE.md Sec10.5 "no trust UX") — "View source email" + the full
 * provenance detail a trust surface needs: where this record actually came
 * from, how confident the AI extraction was, whether the sender's own
 * authentication passed, and the exact reasoning behind the independently-
 * derived status (Task 8's `derivedStatusExplanation`). Every field here
 * already existed on the wire (`billing.serializer.ts`) — this is the first
 * place any of it is actually shown to a user.
 */
export function BillingSourceDialog({ record, open, onOpenChange }: BillingSourceDialogProps) {
  const { general } = usePreferences();
  if (!record) return null;

  const OriginIcon: LucideIcon =
    record.source === "manual" ? UserPen : record.source === "auto_sync" ? RefreshCw : Mail;
  const originLabel =
    record.source === "manual"
      ? "You added this record manually"
      : record.source === "auto_sync"
        ? `Synced automatically from ${record.platform.name}'s own billing data`
        : "Found in a connected email inbox";

  // Gmail message ids open reliably at this URL; Outlook/Graph has no
  // equally reliable deep-link format, so no link is attempted for it — the
  // metadata and evidence below are shown instead either way.
  const gmailLink =
    record.source === "email_sync" && record.platform.slug === "gmail" && record.sourceMessageId
      ? `https://mail.google.com/mail/u/0/#all/${record.sourceMessageId}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <OriginIcon className="size-4 text-muted-foreground" />
            Where this record came from
          </DialogTitle>
          <DialogDescription>{originLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {record.vendor ? (
            <Field label="Resolved vendor">
              {record.vendor.name}
              {record.vendor.domain ? (
                <span className="text-muted-foreground"> · {record.vendor.domain}</span>
              ) : null}
            </Field>
          ) : null}

          {record.derivedStatusExplanation ? (
            <Field label="Why this status">{record.derivedStatusExplanation}</Field>
          ) : null}

          {record.manuallyEditedAt ? (
            <Field label="Manual edit">
              Edited by you on {formatDateTime(record.manuallyEditedAt, general)} — this overrides
              whatever the original source said.
            </Field>
          ) : null}

          {record.source === "email_sync" ? (
            <>
              {record.senderEmail ? (
                <Field label="Sender">
                  {record.senderEmail}
                  {record.senderDomain ? (
                    <span className="text-muted-foreground"> ({record.senderDomain})</span>
                  ) : null}
                </Field>
              ) : null}
              {record.subject ? <Field label="Subject">{record.subject}</Field> : null}
              {record.receivedAt ? (
                <Field label="Received">{formatDateTime(record.receivedAt, general)}</Field>
              ) : null}
              {typeof record.extractionConfidence === "number" ? (
                <Field label="AI extraction confidence">
                  <span className="inline-flex items-center gap-2">
                    {Math.round(record.extractionConfidence * 100)}%
                    {isLowConfidence(record) ? (
                      <Badge variant="destructive">Low — worth double-checking</Badge>
                    ) : null}
                  </span>
                </Field>
              ) : null}
              {record.senderAuthResult ? (
                <Field label="Sender authentication (SPF/DKIM/DMARC)">
                  {SENDER_AUTH_LABEL[record.senderAuthResult]}
                </Field>
              ) : null}
              {record.senderReplyToMismatch ? (
                <Field label="Reply-To check">
                  <span className="text-warning">
                    This email&apos;s Reply-To address is on a different domain than its From:
                    address — a pattern sometimes used to redirect replies.
                  </span>
                </Field>
              ) : null}
              {record.evidence && record.evidence.length > 0 ? (
                <Field label="Evidence from the email">
                  <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                    {record.evidence.map((line, i) => (
                      <li key={i}>&ldquo;{line}&rdquo;</li>
                    ))}
                  </ul>
                </Field>
              ) : null}
              {gmailLink ? (
                <Button variant="outline" size="sm" render={<a href={gmailLink} target="_blank" rel="noopener noreferrer" />}>
                  <ExternalLink />
                  View in Gmail
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
