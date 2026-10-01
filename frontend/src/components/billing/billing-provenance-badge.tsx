"use client";

import { Mail, PencilLine, RefreshCw, TriangleAlert, UserPen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BillingRecord } from "@/services/types/billing";

/** Below this, the extraction is flagged rather than presented as fact — an
 *  AI-read amount/status the model itself wasn't confident about shouldn't
 *  look identical to one it was sure of. Chosen as a reasonable, documented
 *  default (not derived from any specific calibration data). */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

function originMeta(record: BillingRecord): { icon: LucideIcon; label: string } {
  if (record.source === "manual") return { icon: UserPen, label: "You added" };
  if (record.source === "auto_sync") {
    return { icon: RefreshCw, label: `Synced from ${record.platform.name}` };
  }
  return { icon: Mail, label: "From email" };
}

/** True when this record's AI extraction confidence is low enough to flag —
 *  only meaningful for email_sync records (the only source with a real
 *  extraction step; auto_sync reads a platform's own API, manual is typed
 *  directly, neither ever has `extractionConfidence`). */
export function isLowConfidence(record: BillingRecord): boolean {
  return (
    record.source === "email_sync" &&
    typeof record.extractionConfidence === "number" &&
    record.extractionConfidence < LOW_CONFIDENCE_THRESHOLD
  );
}

interface BillingProvenanceBadgeProps {
  record: BillingRecord;
  onClick: () => void;
}

/**
 * WP-5 (CLAUDE.md Sec10.5 "no trust UX") — the minimum origin signal: "You
 * added" / "From email" / "Synced from X", a low-confidence flag when the
 * AI extraction wasn't sure, and a manual-edit indicator when a human has
 * since overridden whatever the source originally said. Clicking opens the
 * full provenance detail (`BillingSourceDialog`).
 */
export function BillingProvenanceBadge({ record, onClick }: BillingProvenanceBadgeProps) {
  const { icon: Icon, label } = originMeta(record);
  const lowConfidence = isLowConfidence(record);
  const edited = Boolean(record.manuallyEditedAt) && record.source !== "manual";

  return (
    <div className="flex items-center gap-1.5">
      <Badge
        variant="outline"
        render={<button type="button" onClick={onClick} />}
        className="cursor-pointer hover:bg-muted"
      >
        <Icon data-icon="inline-start" />
        {label}
      </Badge>
      {lowConfidence ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex text-warning">
                <TriangleAlert className="size-3.5" />
              </span>
            }
          />
          <TooltipContent>
            Low-confidence AI extraction
            {typeof record.extractionConfidence === "number"
              ? ` (${Math.round(record.extractionConfidence * 100)}%)`
              : ""}{" "}
            — worth double-checking.
          </TooltipContent>
        </Tooltip>
      ) : null}
      {edited ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex text-muted-foreground">
                <PencilLine className="size-3.5" />
              </span>
            }
          />
          <TooltipContent>Edited by you — overrides the original source.</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
