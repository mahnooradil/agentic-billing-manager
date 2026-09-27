/**
 * The one place that appends a `BillingEvent` AND recomputes/stores the
 * dual-written `derivedStatus*` fields on the owning `Billing` document —
 * used by both sync-engine.ts (email_sync) and billing.controller.ts
 * (manual corrections) so the two never drift out of sync with each other.
 * Never touches `Billing.status` itself — see billing.model.ts's
 * `derivedStatus` docstring for why.
 */
import { Types } from "mongoose";

import { Billing } from "@/models/billing.model";
import { BillingEvent, type BillingEventType } from "@/models/billing-event.model";
import { deriveStatus, type BillingEventLike } from "@/services/billing/status-machine";

export interface RecordBillingEventInput {
  organization: Types.ObjectId;
  billing: Types.ObjectId;
  type: BillingEventType;
  occurredAt: Date;
  confidence: number;
  source: "email_sync" | "auto_sync" | "user";
  correctedStatus?: "Pending" | "Paid" | "Overdue";
  amount?: number;
  sourceMessageId?: string;
  createdBy?: Types.ObjectId;
}

/**
 * Appends one event, then re-derives status from the record's ENTIRE event
 * history (not just the new event) — this is what actually makes an
 * out-of-order or delayed event (an older invoice email processed in a
 * later sync run than its own payment confirmation) resolve correctly,
 * rather than only ever reacting to whatever was written most recently.
 * Best-effort on the Billing update — a failure to write the derived fields
 * must never break the caller's own write (the real `status` field), since
 * this is a comparison/observability layer, not the source of truth yet.
 */
export async function recordBillingEvent(input: RecordBillingEventInput): Promise<void> {
  await BillingEvent.create({
    organization: input.organization,
    billing: input.billing,
    type: input.type,
    occurredAt: input.occurredAt,
    confidence: input.confidence,
    source: input.source,
    ...(input.correctedStatus ? { correctedStatus: input.correctedStatus } : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
  });

  await recomputeDerivedStatus(input.billing).catch(() => {
    // Best-effort — the real `status` field (written independently by the
    // caller) is what the app actually runs on; this comparison layer must
    // never fail the caller's own operation.
  });
}

/** Re-reads a Billing record's full event history and its own `dueDate`,
 *  runs `deriveStatus()`, and stores the result. Exported separately from
 *  `recordBillingEvent` so the vendor/index backfill-style migration this
 *  task also ships can recompute in bulk without re-appending events. */
export async function recomputeDerivedStatus(billingId: Types.ObjectId): Promise<void> {
  const [billing, events] = await Promise.all([
    Billing.findById(billingId).select("dueDate"),
    BillingEvent.find({ billing: billingId }).select(
      "type occurredAt confidence source correctedStatus"
    ),
  ]);
  if (!billing) return;

  const eventLikes: BillingEventLike[] = events.map((e) => ({
    type: e.type,
    occurredAt: e.occurredAt,
    confidence: e.confidence,
    source: e.source,
    correctedStatus: e.correctedStatus,
  }));

  const result = deriveStatus(eventLikes, billing.dueDate ?? null);

  await Billing.updateOne(
    { _id: billingId },
    {
      $set: {
        derivedStatus: result.status,
        derivedStatusConfidence: result.confidence,
        derivedStatusBasis: result.basis,
        derivedStatusExplanation: result.explanation,
        derivedStatusUpdatedAt: new Date(),
      },
    }
  );
}
