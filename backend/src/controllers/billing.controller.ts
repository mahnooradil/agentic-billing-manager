/**
 * Billing CRUD controllers.
 *
 * Input is validated by the `validate` middleware and all routes are protected
 * by `authenticate`, so these handlers focus on business logic. Errors are
 * thrown as `AppError`s and formatted centrally; async rejections are forwarded
 * via `asyncHandler`. Follows the same model→controller pattern as platforms.
 *
 * Every billing record belongs to one Platform; the reference is populated on
 * reads so the serialized record carries a minimal { id, name, slug } platform.
 */
import { isValidObjectId } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicBilling } from "@/utils/billing.serializer";
import { Billing, type BillingDocument } from "@/models/billing.model";
import { Platform } from "@/models/platform.model";
import type {
  CreateBillingInput,
  UpdateBillingInput,
} from "@/validators/billing.validator";

/** Loads a billing record by id (platform populated) or throws a 404. */
async function findBillingOr404(id: string): Promise<BillingDocument> {
  if (!isValidObjectId(id)) {
    throw new AppError("Billing record not found", 404);
  }
  const billing = await Billing.findById(id).populate("platform");
  if (!billing) {
    throw new AppError("Billing record not found", 404);
  }
  return billing;
}

/** Ensures the referenced platform exists, else a 400 (bad reference). */
async function assertPlatformExists(platformId: string): Promise<void> {
  const exists = await Platform.exists({ _id: platformId });
  if (!exists) {
    throw new AppError("The selected platform does not exist", 400);
  }
}

/** GET /api/billing — list all billing records (newest billing date first). */
export const listBillingRecords = asyncHandler(async (_req, res) => {
  const records = await Billing.find()
    .populate("platform")
    .sort({ billingDate: -1, createdAt: -1 });
  sendSuccess(res, 200, "Billing records retrieved", {
    billingRecords: records.map(toPublicBilling),
  });
});

/** GET /api/billing/:id — fetch a single billing record. */
export const getBillingRecord = asyncHandler(async (req, res) => {
  const billing = await findBillingOr404(req.params.id as string);
  sendSuccess(res, 200, "Billing record retrieved", {
    billingRecord: toPublicBilling(billing),
  });
});

/** POST /api/billing — create a billing record. */
export const createBillingRecord = asyncHandler(async (req, res) => {
  const body = req.body as CreateBillingInput;

  await assertPlatformExists(body.platform);

  const billing = await Billing.create(body);
  await billing.populate("platform");
  sendSuccess(res, 201, "Billing record created", {
    billingRecord: toPublicBilling(billing),
  });
});

/** PUT /api/billing/:id — update a billing record. */
export const updateBillingRecord = asyncHandler(async (req, res) => {
  const body = req.body as UpdateBillingInput;
  const billing = await findBillingOr404(req.params.id as string);

  // Only re-validate the platform reference when it is actually changing.
  if (body.platform) {
    await assertPlatformExists(body.platform);
  }

  Object.assign(billing, body);
  await billing.save();
  await billing.populate("platform");

  sendSuccess(res, 200, "Billing record updated", {
    billingRecord: toPublicBilling(billing),
  });
});

/** DELETE /api/billing/:id — remove a billing record. */
export const deleteBillingRecord = asyncHandler(async (req, res) => {
  const billing = await findBillingOr404(req.params.id as string);
  await billing.deleteOne();
  sendSuccess(res, 200, "Billing record deleted", {
    id: billing._id.toString(),
  });
});
