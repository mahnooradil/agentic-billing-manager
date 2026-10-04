/**
 * Usage accrual controller — WP-4/WP-5's missing frontend piece. Read-only:
 * rows are written exclusively by `billing-sync/sync-engine.ts` for the 124
 * of 129 billing-sync adapters that report month-to-date usage/balance
 * rather than a discrete invoice (see usage-accrual.model.ts's docstring).
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { UsageAccrual, type UsageAccrualDocument } from "@/models/usage-accrual.model";
import { toPublicUsageAccrual } from "@/utils/usage-accrual.serializer";

/**
 * GET /api/usage-accruals — the LATEST snapshot per connected platform
 * (each billing-sync run upserts a new day-keyed row rather than updating
 * one row in place — see e.g. `vultr.adapter.ts`'s `externalId`, so a
 * connection accumulates one row per sync day; this endpoint collapses that
 * down to "what's the current balance/usage right now" per connection,
 * which is what a usage-visibility UI actually needs, not a full ledger).
 */
export const listUsageAccruals = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const latestPerConnection = await UsageAccrual.aggregate([
    { $match: { organization: organization._id } },
    { $sort: { snapshotAt: -1 } },
    {
      $group: {
        _id: "$platformConnection",
        doc: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$doc" } },
    { $sort: { snapshotAt: -1 } },
  ]);

  const populated = await UsageAccrual.populate<{
    platformConnection: UsageAccrualDocument["platformConnection"];
  }>(latestPerConnection, {
    path: "platformConnection",
    select: "displayName platform",
  });

  sendSuccess(res, 200, "Usage accruals retrieved", {
    accruals: (populated as UsageAccrualDocument[]).map(toPublicUsageAccrual),
  });
});
