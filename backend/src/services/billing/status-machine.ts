/**
 * Status state machine — Task 8. `deriveStatus()` is a pure function: given
 * a Billing record's full event history (append-only, see
 * models/billing-event.model.ts) and its due date, it computes a status
 * from immutable EVIDENCE rather than the single latest email overwriting a
 * mutable field. This is what actually fixes the real, confirmed bug behind
 * this whole task (GM-027): a stale reminder email, processed in a LATER
 * sync run than a genuine payment confirmation, currently overwrites
 * `Billing.status` straight back to "Pending" — because today's code only
 * ever looks at the one email it just read, never the record's real history.
 *
 * Never called with side effects here — see
 * services/billing/billing-event-recorder.service.ts for the function that
 * actually appends an event and writes the result onto a Billing document
 * (dual-written into `derivedStatus*`, alongside — not replacing — the
 * existing `status` field, per the roadmap's own "ship behind a flag,
 * dual-write, compare, then cut over" sequencing for this task).
 */
import type { BillingEventType } from "@/models/billing-event.model";

/** The full target status vocabulary (richer than `Billing.status`'s
 *  current 3 states). `disputed` and `partially_paid` are kept for
 *  vocabulary completeness against the target design even though nothing in
 *  this codebase emits an event that could ever produce them yet — no
 *  extraction/webhook source currently reports a dispute or a partial
 *  payment. Documented here rather than silently omitted, the same way
 *  flow/05's own target-design section records fields it deliberately
 *  didn't build yet. */
export const DERIVED_STATUSES = [
  "issued",
  "pending",
  "due_soon",
  "overdue",
  "payment_processing",
  "paid",
  "partially_paid",
  "refunded",
  "partially_refunded",
  "cancelled",
  "disputed",
] as const;
export type DerivedStatus = (typeof DERIVED_STATUSES)[number];

export const DERIVED_STATUS_BASES = ["ai", "user", "rule", "adapter"] as const;
export type DerivedStatusBasis = (typeof DERIVED_STATUS_BASES)[number];

export interface DerivedStatusResult {
  status: DerivedStatus;
  confidence: number;
  basis: DerivedStatusBasis;
  explanation: string;
}

/** The minimal shape `deriveStatus` needs from an event — matches
 *  `IBillingEvent`'s relevant fields exactly, kept separate so this stays a
 *  pure function testable with plain object literals, no Mongoose document
 *  required. */
export interface BillingEventLike {
  type: BillingEventType;
  occurredAt: Date;
  confidence: number;
  source: "email_sync" | "auto_sync" | "user";
  correctedStatus?: "Pending" | "Paid" | "Overdue";
}

const CORRECTED_STATUS_TO_DERIVED: Record<"Pending" | "Paid" | "Overdue", DerivedStatus> = {
  Pending: "pending",
  Paid: "paid",
  Overdue: "overdue",
};

const DUE_SOON_WINDOW_MS = 7 * 86_400_000;

/** Step 6 of the algorithm — used both when there's no evidence at all, and
 *  when the only evidence so far is non-decisive (an issued invoice or a
 *  reminder, no payment outcome yet). */
function dueDateFallback(dueDate: Date | null, now: Date): DerivedStatus {
  if (!dueDate) return "pending";
  const diffMs = dueDate.getTime() - now.getTime();
  if (diffMs < 0) return "overdue";
  if (diffMs <= DUE_SOON_WINDOW_MS) return "due_soon";
  return "pending";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function basisFor(event: BillingEventLike): DerivedStatusBasis {
  if (event.source === "user") return "user";
  if (event.source === "auto_sync") return "adapter";
  return "ai";
}

interface Governing {
  status: DerivedStatus;
  event: BillingEventLike;
  /** Once true, no later event of any kind (except a `user_correction`,
   *  handled entirely separately in step 1 below) can change `governing`
   *  again — see the loop's absorbing branch. The spec's own wording only
   *  says explicitly that "a later reminder does NOT reopen" a terminal
   *  event; this implementation reads "terminal... absorbing" as applying
   *  to every later synced event, not reminders alone — a deliberate,
   *  documented interpretation of a genuinely ambiguous spec, the same way
   *  earlier tasks this session made and recorded similar calls. */
  terminal: boolean;
  /** True once real payment-outcome evidence (paid/processing/terminal) has
   *  been seen — false for "issued"/reminder, which never resolve the
   *  status on their own (step 6 still applies). */
  decisive: boolean;
}

/**
 * Derives a status from a Billing record's full event history. Pure — no
 * database access, no mutation. Steps below are numbered to match the
 * algorithm this implements exactly:
 *
 *   1. Any user_correction event → its status wins outright, confidence 1.0
 *      (the most recent correction, if there is more than one).
 *   2. Every remaining event is sorted by `occurredAt` (when the evidence
 *      itself happened), not by when it was synced.
 *   3/4. Terminal events (refunded/partially_refunded/cancelled/credit_note)
 *      and `payment_confirmed` are both absorbing — nothing chronologically
 *      earlier can reopen them, and per this implementation's reading,
 *      nothing LATER but less significant (a stale reminder) can either.
 *   5. `payment_failed` after `payment_confirmed` DOES reopen the record,
 *      into `payment_processing` — a real negative signal, unlike a stale
 *      reminder.
 *   6. No decisive payment/terminal event at all → the due date alone
 *      decides: overdue (past), due_soon (within 7 days), else pending.
 *   7. Each `amount_changed` beyond the first is treated as a conflict —
 *      0.2 confidence penalty per extra one.
 *   8. Confidence is the governing event's own confidence, reduced by the
 *      step-7 penalty, clamped to [0, 1].
 */
export function deriveStatus(
  events: BillingEventLike[],
  dueDate: Date | null,
  now: Date = new Date()
): DerivedStatusResult {
  // Step 1.
  const corrections = events
    .filter(
      (e): e is BillingEventLike & { correctedStatus: "Pending" | "Paid" | "Overdue" } =>
        e.type === "user_correction" && e.correctedStatus !== undefined
    )
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  if (corrections.length > 0) {
    const latest = corrections[0];
    return {
      status: CORRECTED_STATUS_TO_DERIVED[latest.correctedStatus],
      confidence: 1,
      basis: "user",
      explanation: "A human manually set this status directly — it always overrides synced evidence.",
    };
  }

  // Step 2.
  const sorted = events
    .filter((e) => e.type !== "user_correction")
    .slice()
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  if (sorted.length === 0) {
    return {
      status: dueDateFallback(dueDate, now),
      confidence: 1,
      basis: "rule",
      explanation: "No evidence recorded yet — status derived from the due date alone.",
    };
  }

  let governing: Governing | null = null;
  let amountChanges = 0;

  for (const event of sorted) {
    if (governing?.terminal) {
      if (event.type === "amount_changed") amountChanges++;
      continue;
    }

    switch (event.type) {
      case "invoice_issued":
      case "reminder":
      case "final_reminder":
        if (!governing || !governing.decisive) {
          governing = { status: "issued", event, terminal: false, decisive: false };
        }
        break;
      case "payment_confirmed":
        governing = { status: "paid", event, terminal: false, decisive: true };
        break;
      case "payment_failed":
        governing = { status: "payment_processing", event, terminal: false, decisive: true };
        break;
      case "refunded":
        governing = { status: "refunded", event, terminal: true, decisive: true };
        break;
      case "partially_refunded":
        governing = { status: "partially_refunded", event, terminal: true, decisive: true };
        break;
      case "cancelled":
      case "credit_note":
        // A credit note voids the amount owed the same way a cancellation
        // does — the target vocabulary has no separate status for it.
        governing = { status: "cancelled", event, terminal: true, decisive: true };
        break;
      case "amount_changed":
        amountChanges++;
        break;
      default:
        break;
    }
  }

  const penalty = 0.2 * Math.max(0, amountChanges - 1);

  if (!governing || !governing.decisive) {
    const evidenceEvent = governing?.event ?? sorted[sorted.length - 1];
    return {
      status: dueDateFallback(dueDate, now),
      confidence: clamp01(evidenceEvent.confidence - penalty),
      basis: "rule",
      explanation:
        "An invoice/reminder was observed but no payment outcome yet — status derived from the due date.",
    };
  }

  return {
    status: governing.status,
    confidence: clamp01(governing.event.confidence - penalty),
    basis: basisFor(governing.event),
    explanation: explanationFor(governing),
  };
}

function explanationFor(governing: Governing): string {
  switch (governing.status) {
    case "paid":
      return "A payment confirmation was observed and nothing later overrides it.";
    case "payment_processing":
      return "A payment attempt failed — awaiting a retry or resolution.";
    case "refunded":
      return "A refund was observed for the full amount.";
    case "partially_refunded":
      return "A partial refund was observed.";
    case "cancelled":
      return "This invoice was cancelled or voided by a credit note.";
    default:
      return "Derived from the recorded event history.";
  }
}

/** Narrow cutover (not the full target vocabulary) — maps `deriveStatus()`'s
 *  richer 11-state result down onto the 3-state `Billing.status` the rest of
 *  the app (UI badges/filters, notification rules, analytics groupings, the
 *  Billing Advisor Agent's tools) still runs on. This is deliberately scoped
 *  to fix the one confirmed real bug (GM-027 — a stale reminder email,
 *  synced in a later run than a genuine payment confirmation, reverting
 *  `status` back to "Pending" because the naive write only ever looks at the
 *  single email it just read) WITHOUT expanding the app's status vocabulary
 *  — that is a separate, much larger decision the user explicitly deferred.
 *
 *  Given the event types `email-sync/sync-engine.ts` actually emits today
 *  (`invoice_issued`/`reminder`/`final_reminder`/`payment_confirmed`/
 *  `payment_failed`/`amount_changed`/`user_correction`), `deriveStatus()` can
 *  currently only ever return "pending"/"due_soon"/"overdue"/"paid"/
 *  "payment_processing" in practice — "issued" is absorbed into the due-date
 *  fallback before it's ever returned, and "refunded"/"partially_refunded"/
 *  "cancelled"/"partially_paid"/"disputed" require event types nothing in
 *  this codebase emits yet. The switch below is still exhaustive (for type
 *  safety and so a future event source doesn't silently fall through), with
 *  the currently-unreachable branches chosen conservatively — see inline
 *  comments — rather than guessed. */
export function mapDerivedStatusToBillingStatus(
  derived: DerivedStatus
): "Pending" | "Paid" | "Overdue" {
  switch (derived) {
    case "paid":
      return "Paid";
    case "overdue":
      return "Overdue";
    // A failed payment after a prior confirmation is a real problem state —
    // closer to "needs attention" than "Pending", and matches what the old
    // naive write would have called it (the AI extractor only ever reports
    // "Overdue" for this, which is what originally produced the
    // `payment_failed` event in the first place — see `eventTypeForStatus`).
    case "payment_processing":
      return "Overdue";
    // "due_soon" has no dedicated bucket in the 3-state vocabulary — the
    // existing `dueDate` field already powers its own separate "due in N
    // days" alert (see billing.model.ts), so this stays "Pending" rather
    // than inventing a 4th value.
    case "due_soon":
    case "pending":
    case "issued":
      return "Pending";
    // Unreachable today (see docstring above) — chosen conservatively so a
    // future event source can't silently cause an invoice to disappear from
    // "needs attention"/outstanding views. Money was actually received
    // before being refunded, so "Paid" (its historical state) is the least
    // misleading of the 3 available values.
    case "refunded":
    case "partially_refunded":
    case "partially_paid":
      return "Paid";
    // Unreachable today. No money changed hands and nothing is owed, but
    // the 3-state vocabulary has no "void" bucket — defaults to "Pending"
    // rather than "Paid" so a cancelled invoice doesn't misleadingly count
    // as collected revenue in analytics/stats.
    case "cancelled":
    case "disputed":
      return "Pending";
    default:
      return "Pending";
  }
}
