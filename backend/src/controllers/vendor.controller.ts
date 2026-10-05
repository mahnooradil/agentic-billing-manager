/**
 * Vendor confirmation — WP-5's "confirm detected vendors" onboarding step
 * (flow/08 §9). A newly-detected Vendor (see vendor-resolver.service.ts)
 * starts unconfirmed; this surfaces it for a human to confirm it's real or
 * reject it as a misread, without touching any Billing record either way
 * (non-destructive, same reasoning as the duplicate-merge feature below).
 */
import { isValidObjectId, type Types } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import {
  toPublicVendor,
  type PublicPendingVendor,
  type PublicVendorDueForRating,
} from "@/utils/vendor.serializer";
import { Vendor, type VendorDocument } from "@/models/vendor.model";
import { Billing } from "@/models/billing.model";
import type { RateVendorInput } from "@/validators/vendor.validator";

/** flow/extra-02 Part A1 — re-ask after this many days, long enough not to
 *  nag, short enough that a rating still reflects real current usage. */
const RATING_STALE_DAYS = 60;

async function findVendorOr404(id: string, organizationId: Types.ObjectId): Promise<VendorDocument> {
  if (!isValidObjectId(id)) {
    throw new AppError("Vendor not found", 404);
  }
  const vendor = await Vendor.findOne({ _id: id, organization: organizationId });
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }
  return vendor;
}

/** GET /api/vendors/pending — vendors awaiting confirmation, each with a
 *  sample Billing record so the user has something to judge it by. */
export const listPendingVendors = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const vendors = await Vendor.find({
    organization: organization._id,
    confirmedAt: { $exists: false },
    rejectedAt: { $exists: false },
  }).sort({ createdAt: -1 });

  const pending: PublicPendingVendor[] = await Promise.all(
    vendors.map(async (vendor) => {
      const sample = await Billing.findOne({ organization: organization._id, vendor: vendor._id })
        .sort({ billingDate: -1 })
        .select("amount currency billingDate");
      return {
        ...toPublicVendor(vendor),
        sampleBilling: sample
          ? { amount: sample.amount, currency: sample.currency, billingDate: sample.billingDate }
          : null,
      };
    })
  );

  sendSuccess(res, 200, "Pending vendors retrieved", { vendors: pending });
});

/** POST /api/vendors/:id/confirm — "yes, this is a real vendor." */
export const confirmVendor = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const vendor = await findVendorOr404(req.params.id as string, organization._id);
  vendor.confirmedAt = new Date();
  vendor.rejectedAt = undefined;
  await vendor.save();

  sendSuccess(res, 200, "Vendor confirmed", { vendor: toPublicVendor(vendor) });
});

/** POST /api/vendors/:id/reject — "not a real vendor" (an AI misread). Only
 *  stops future prompts for this vendor — its already-synced Billing
 *  records are deliberately left untouched (a separate, bigger decision
 *  about what to do with them, not part of this feature's scope). */
export const rejectVendor = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const vendor = await findVendorOr404(req.params.id as string, organization._id);
  vendor.rejectedAt = new Date();
  vendor.confirmedAt = undefined;
  await vendor.save();

  sendSuccess(res, 200, "Vendor marked as not a vendor", { vendor: toPublicVendor(vendor) });
});

/** GET /api/vendors/due-for-rating — flow/extra-02 Part A1. Confirmed
 *  vendors never rated, or last rated more than `RATING_STALE_DAYS` days
 *  ago. Only confirmed vendors are asked about — rating something not even
 *  confirmed as a real vendor yet would be meaningless. */
export const listVendorsDueForRating = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const staleCutoff = new Date(Date.now() - RATING_STALE_DAYS * 86_400_000);

  const vendors = await Vendor.find({
    organization: organization._id,
    confirmedAt: { $exists: true },
    rejectedAt: { $exists: false },
    $or: [{ utilityRatedAt: { $exists: false } }, { utilityRatedAt: { $lt: staleCutoff } }],
  }).sort({ utilityRatedAt: 1, createdAt: -1 });

  const dueForRating: PublicVendorDueForRating[] = await Promise.all(
    vendors.map(async (vendor) => {
      const sample = await Billing.findOne({ organization: organization._id, vendor: vendor._id })
        .sort({ billingDate: -1 })
        .select("amount currency billingDate");
      return {
        ...toPublicVendor(vendor),
        sampleBilling: sample
          ? { amount: sample.amount, currency: sample.currency, billingDate: sample.billingDate }
          : null,
      };
    })
  );

  sendSuccess(res, 200, "Vendors due for rating retrieved", { vendors: dueForRating });
});

/** POST /api/vendors/:id/rate — "how often do you use this?" */
export const rateVendor = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const vendor = await findVendorOr404(req.params.id as string, organization._id);
  const { utilityRating } = req.body as RateVendorInput;
  vendor.utilityRating = utilityRating;
  vendor.utilityRatedAt = new Date();
  await vendor.save();

  sendSuccess(res, 200, "Vendor usage rated", { vendor: toPublicVendor(vendor) });
});
