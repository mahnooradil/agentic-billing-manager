/**
 * Plan limit enforcement — the counterpart to `GET /api/plan`'s usage display.
 * That endpoint only ever reported usage; these helpers are what actually stop
 * an organization from exceeding its tier once it's at the limit. Uses the
 * exact same counting queries as `plan.controller.ts` so "usage" and
 * "enforcement" can never disagree. Limits gate the ORGANIZATION's shared
 * resources (every member counts against the same cap), not any one member.
 */
import type { Types } from "mongoose";

import { AppError } from "@/utils/appError";
import { getPlan, type PlanTier } from "@/config/plans";
import { PlatformConnection } from "@/models/platform-connection.model";
import { Billing } from "@/models/billing.model";
import { EMAIL_SYNC_PLATFORMS } from "@/services/email-sync/registry";

/** Throws a 403 if adding one more CONNECTED platform would exceed the plan.
 *  Gmail/Outlook email-sync connections are excluded — they're a fallback
 *  data source behind direct billing sync, not a "platform" in the sense
 *  this limit is meant to gate, and a user may reasonably want several of
 *  them (see PlatformConnection's multi-account support) without that
 *  crowding out their real platform integrations. */
export async function assertPlatformConnectionLimit(
  organizationId: Types.ObjectId,
  planTier: PlanTier
): Promise<void> {
  const plan = getPlan(planTier);
  const limit = plan.limits.maxPlatformConnections;
  if (limit === null) return;

  const count = await PlatformConnection.countDocuments({
    organization: organizationId,
    status: "connected",
    platform: { $nin: [...EMAIL_SYNC_PLATFORMS] },
  });
  if (count >= limit) {
    throw new AppError(
      `Your ${plan.displayName} plan allows up to ${limit} connected platform${limit === 1 ? "" : "s"}. Upgrade your plan to connect more.`,
      403
    );
  }
}

/** Throws a 403 if adding one more billing record would exceed the plan. */
export async function assertBillingRecordLimit(
  organizationId: Types.ObjectId,
  planTier: PlanTier
): Promise<void> {
  const plan = getPlan(planTier);
  const limit = plan.limits.maxBillingRecords;
  if (limit === null) return;

  const count = await Billing.countDocuments({ organization: organizationId });
  if (count >= limit) {
    throw new AppError(
      `Your ${plan.displayName} plan allows up to ${limit} billing record${limit === 1 ? "" : "s"}. Upgrade your plan to add more.`,
      403
    );
  }
}

/** How many MORE billing records the plan allows right now (`null` = unlimited). */
export async function getRemainingBillingRecordCapacity(
  organizationId: Types.ObjectId,
  planTier: PlanTier
): Promise<number | null> {
  const plan = getPlan(planTier);
  const limit = plan.limits.maxBillingRecords;
  if (limit === null) return null;

  const count = await Billing.countDocuments({ organization: organizationId });
  return Math.max(0, limit - count);
}
