/**
 * Sender trust — the read/write operations `sync-engine.ts` and
 * `billing.controller.ts` actually need against `SenderProfile`. The
 * nightly trust-TRANSITION logic (when a profile actually flips to
 * trusted/suppressed) lives separately in `sender-profile-scheduler.ts` —
 * this file is the narrower, synchronous-path surface: "is this sender
 * suppressed right now" (checked before every AI extraction call) and
 * "record this real-time signal" (a human just deleted a false positive).
 */
import type { Types } from "mongoose";

import { SenderProfile, type SenderProfileDocument } from "@/models/sender-profile.model";
import { ClassificationFeedback } from "@/models/classification-feedback.model";

/** Upserts and returns the profile for this (organization, domain) —
 *  starts "neutral" with zero counts if this is the first time this
 *  sender has ever been seen. */
export async function resolveSenderProfile(
  organizationId: Types.ObjectId | string,
  domain: string
): Promise<SenderProfileDocument> {
  const normalizedDomain = domain.trim().toLowerCase();
  return SenderProfile.findOneAndUpdate(
    { organization: organizationId, domain: normalizedDomain },
    { $setOnInsert: { organization: organizationId, domain: normalizedDomain } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Checked BEFORE every AI extraction call (sync-engine.ts) — a suppressed
 *  sender's candidate messages are skipped entirely, costing 0 credits.
 *  Read-only: does NOT create a profile for a domain that's never been
 *  seen (a brand-new sender is "neutral" by definition, no row needed yet
 *  just to answer "no, not suppressed"). */
export async function isSenderSuppressed(
  organizationId: Types.ObjectId | string,
  domain: string
): Promise<boolean> {
  const profile = await SenderProfile.findOne({
    organization: organizationId,
    domain: domain.trim().toLowerCase(),
  }).select("trust");
  return profile?.trust === "suppressed";
}

/** Checked after a successful extraction — a trusted sender's confidence
 *  gets a floor raised, rather than only ever being penalized (Task 9's
 *  `applySenderTrustPenalty` already covers the penalty direction). */
export async function isSenderTrusted(
  organizationId: Types.ObjectId | string,
  domain: string
): Promise<boolean> {
  const profile = await SenderProfile.findOne({
    organization: organizationId,
    domain: domain.trim().toLowerCase(),
  }).select("trust");
  return profile?.trust === "trusted";
}

/**
 * Records a real-time false-positive signal — called when a human deletes
 * an email_sync Billing record (billing.controller.ts), the one discrete,
 * unambiguous "the AI got this wrong" event this system has. Increments
 * `SenderProfile.falsePositiveCount` atomically and appends the matching
 * `ClassificationFeedback` entry. Best-effort: never throws, same
 * guarantee as `recordAuditLog`/`recordBillingEvent` — a failure here must
 * never break the delete the user actually asked for.
 */
export async function recordFalsePositive(
  organizationId: Types.ObjectId | string,
  domain: string,
  context: { billing?: Types.ObjectId; sourceMessageId?: string }
): Promise<void> {
  try {
    const normalizedDomain = domain.trim().toLowerCase();
    await SenderProfile.findOneAndUpdate(
      { organization: organizationId, domain: normalizedDomain },
      {
        $inc: { falsePositiveCount: 1 },
        $setOnInsert: { organization: organizationId, domain: normalizedDomain },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    await ClassificationFeedback.create({
      organization: organizationId,
      domain: normalizedDomain,
      billing: context.billing,
      sourceMessageId: context.sourceMessageId,
      aiVerdict: "billing_email",
      userVerdict: "false_positive",
    });
  } catch {
    // Best-effort — see docstring.
  }
}

/** Manual override — a user directly says "always ignore this sender,"
 *  independent of the auto-learned thresholds. `manuallySet: true` so the
 *  nightly job never silently flips this back. */
export async function suppressSenderManually(
  organizationId: Types.ObjectId | string,
  domain: string
): Promise<SenderProfileDocument> {
  const normalizedDomain = domain.trim().toLowerCase();
  return SenderProfile.findOneAndUpdate(
    { organization: organizationId, domain: normalizedDomain },
    {
      $set: { trust: "suppressed", manuallySet: true },
      $setOnInsert: { organization: organizationId, domain: normalizedDomain },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Undoes a suppression (auto-learned or manual) — resets to a genuine
 *  fresh start, not just flipping the label: `falsePositiveCount` back to
 *  0 too, since leaving it at/above the threshold would just re-suppress
 *  on the very next nightly run, defeating the whole point of "undo." */
export async function restoreSender(
  organizationId: Types.ObjectId | string,
  domain: string
): Promise<SenderProfileDocument | null> {
  return SenderProfile.findOneAndUpdate(
    { organization: organizationId, domain: domain.trim().toLowerCase() },
    { $set: { trust: "neutral", manuallySet: false, falsePositiveCount: 0 } },
    { new: true }
  );
}
