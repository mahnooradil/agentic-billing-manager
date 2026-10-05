/**
 * Sender-profile scheduler — WP-11's "nightly job" (flow/04 §7's feedback
 * loop). Two things happen here, once a day, per organization:
 *
 *  1. Recompute `confirmedInvoiceCount` per sender domain — there's no
 *     discrete "user confirmed this" action to hook into in real time (see
 *     sender-trust.service.ts's own docstring), so the signal is inferred:
 *     an email_sync Billing record that's survived (not been deleted) for
 *     at least `CONFIRMATION_GRACE_DAYS` counts as a real confirmation. A
 *     record synced an hour ago hasn't had a fair chance to be reviewed
 *     yet, so it deliberately does NOT count immediately.
 *  2. Evaluate trust transitions against the thresholds flow/04 specifies:
 *     ≥3 false positives AND 0 confirmed → "suppressed" (the pipeline then
 *     skips this sender entirely, see sync-engine.ts); ≥3 confirmed →
 *     "trusted". A profile meeting neither reverts to "neutral". Manually-
 *     set profiles (`manuallySet: true`) are never touched here — a human's
 *     own explicit choice always wins over the auto-learned signal.
 *
 * Same startup-delay + setInterval pattern as every other scheduler in this
 * codebase (see credit-reset-scheduler.ts).
 */
import { Types } from "mongoose";

import { Billing } from "@/models/billing.model";
import { Organization } from "@/models/organization.model";
import { SenderProfile, type SenderTrust } from "@/models/sender-profile.model";
import { upsertNotification } from "@/services/notification/notification-engine";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 90_000;

/** A record must have existed at least this long, undeleted, before it
 *  counts as a real confirmation signal — not just "hasn't been looked at
 *  yet." */
const CONFIRMATION_GRACE_DAYS = 3;

const SUPPRESS_FALSE_POSITIVE_THRESHOLD = 3;
const TRUST_CONFIRMED_THRESHOLD = 3;

interface ConfirmedCountRow {
  _id: string; // domain
  count: number;
}

/** Recomputes every domain's `confirmedInvoiceCount` for one organization,
 *  in a single aggregation — a domain with zero qualifying records simply
 *  isn't in the result, handled by defaulting to 0 below. */
async function recomputeConfirmedCounts(organizationId: string): Promise<Map<string, number>> {
  const cutoff = new Date(Date.now() - CONFIRMATION_GRACE_DAYS * 86_400_000);
  const rows = await Billing.aggregate<ConfirmedCountRow>([
    {
      $match: {
        organization: new Types.ObjectId(organizationId),
        source: "email_sync",
        senderDomain: { $exists: true, $ne: null },
        createdAt: { $lte: cutoff },
      },
    },
    { $group: { _id: "$senderDomain", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.count]));
}

function evaluateTrust(falsePositiveCount: number, confirmedInvoiceCount: number): SenderTrust {
  if (
    falsePositiveCount >= SUPPRESS_FALSE_POSITIVE_THRESHOLD &&
    confirmedInvoiceCount === 0
  ) {
    return "suppressed";
  }
  if (confirmedInvoiceCount >= TRUST_CONFIRMED_THRESHOLD) {
    return "trusted";
  }
  return "neutral";
}

async function evaluateOrganization(organizationId: string): Promise<void> {
  const confirmedCounts = await recomputeConfirmedCounts(organizationId);
  const profiles = await SenderProfile.find({ organization: organizationId, manuallySet: false });

  for (const profile of profiles) {
    const confirmedInvoiceCount = confirmedCounts.get(profile.domain) ?? 0;
    const nextTrust = evaluateTrust(profile.falsePositiveCount, confirmedInvoiceCount);
    const wasNewlySuppressed = nextTrust === "suppressed" && profile.trust !== "suppressed";

    profile.confirmedInvoiceCount = confirmedInvoiceCount;
    profile.trust = nextTrust;
    profile.lastEvaluatedAt = new Date();
    await profile.save();

    if (wasNewlySuppressed) {
      // "tells the user it did, with an undo" — flow/04's own stated
      // requirement for this to be a visible, reversible decision, never a
      // silent one.
      await upsertNotification(organizationId, {
        signature: `system:sender-suppressed:${profile.domain}`,
        category: "system",
        severity: "info",
        title: "An email sender was automatically muted",
        message: `Emails from "${profile.domain}" kept getting deleted as not-real-invoices, so this workspace will stop scanning them to save credits. Restore it anytime from Settings if this was wrong.`,
      }).catch(() => {
        // Best-effort — never let a notification failure break the trust
        // transition that already landed.
      });
    }
  }
}

async function runEvaluationPass(): Promise<void> {
  const organizations = await Organization.find().select("_id");
  for (const org of organizations) {
    await evaluateOrganization(org._id.toString()).catch(() => {
      // One organization's failure must never block the rest.
    });
  }
}

/** Starts the recurring sender-trust evaluation job. Fire-and-forget; never throws. */
export function startSenderProfileScheduler(): void {
  setTimeout(() => {
    void runEvaluationPass();
  }, STARTUP_DELAY_MS);
  setInterval(() => {
    void runEvaluationPass();
  }, CHECK_INTERVAL_MS);
}

// Exported for the scratch/live-test and unit-test paths that want to run
// one evaluation pass synchronously without waiting on the real clock.
export { runEvaluationPass, evaluateOrganization };
