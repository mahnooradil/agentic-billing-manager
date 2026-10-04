/**
 * The one place that appends a `BillingEvent` AND recomputes/stores the
 * dual-written `derivedStatus*` fields on the owning `Billing` document —
 * used by both sync-engine.ts (email_sync) and billing.controller.ts
 * (manual corrections) so the two never drift out of sync with each other.
 * Does not itself write `Billing.status` — email-sync/sync-engine.ts is the
 * one caller that maps the returned result (via
 * `mapDerivedStatusToBillingStatus`) onto `status`; see its commit loop.
 */
import { Types } from "mongoose";

import { Billing } from "@/models/billing.model";
import { BillingEvent, type BillingEventType } from "@/models/billing-event.model";
import {
  deriveStatus,
  type BillingEventLike,
  type DerivedStatusResult,
} from "@/services/billing/status-machine";

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
 * this remains a comparison/observability layer at the model level; it is
 * the CALLER's choice whether to also act on the returned result.
 * Returns `null` if the recompute itself failed (best-effort, not fatal).
 */
export async function recordBillingEvent(
  input: RecordBillingEventInput
): Promise<DerivedStatusResult | null> {
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

  return recomputeDerivedStatus(input.billing).catch(() => {
    // Best-effort — the real `status` field (written independently by the
    // caller) is what the app actually runs on; this comparison layer must
    // never fail the caller's own operation.
    return null;
  });
}

/** Re-reads a Billing record's full event history and its own `dueDate`,
 *  runs `deriveStatus()`, and stores the result. Exported separately from
 *  `recordBillingEvent` so the vendor/index backfill-style migration this
 *  task also ships can recompute in bulk without re-appending events.
 *  Returns the computed result (or `null` if the record no longer exists)
 *  so a caller can act on it beyond just persisting `derivedStatus*`. */
export async function recomputeDerivedStatus(
  billingId: Types.ObjectId
): Promise<DerivedStatusResult | null> {
  const [billing, events] = await Promise.all([
    Billing.findById(billingId).select("dueDate"),
    BillingEvent.find({ billing: billingId }).select(
      "type occurredAt confidence source correctedStatus"
    ),
  ]);
  if (!billing) return null;

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

  return result;
}
