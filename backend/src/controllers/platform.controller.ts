/**
 * Platform CRUD controllers.
 *
 * Input is validated by the `validate` middleware and all routes are protected
 * by `authenticate`, so these handlers focus on business logic. Errors are
 * thrown as `AppError`s and formatted centrally; async rejections are forwarded
 * via `asyncHandler`. Follows the same model→controller pattern as auth.
 *
 * Every query is scoped to the authenticated user's ORGANIZATION — platforms
 * are shared across every member of the org, never visible to another org.
 * `user` is still stamped on create (who added it) but is audit-only, never
 * a query filter.
 */
import { isValidObjectId, type Types } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicPlatform } from "@/utils/platform.serializer";
import { Platform, type PlatformDocument } from "@/models/platform.model";
import { Billing } from "@/models/billing.model";
import { emitBusinessDataChanged } from "@/services/events/event-bus";
import type {
  CreatePlatformInput,
  UpdatePlatformInput,
} from "@/validators/platform.validator";

/** Loads a platform by id, scoped to its organization, or throws a 404 (also for malformed ids). */
async function findPlatformOr404(
  id: string,
  organizationId: Types.ObjectId
): Promise<PlatformDocument> {
  if (!isValidObjectId(id)) {
    throw new AppError("Platform not found", 404);
  }
  const platform = await Platform.findOne({ _id: id, organization: organizationId });
  if (!platform) {
    throw new AppError("Platform not found", 404);
  }
  return platform;
}

/** GET /api/platforms — list the organization's platforms (newest first). */
export const listPlatforms = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  if (!user || !organization) {
    throw new AppError("Authentication required", 401);
  }

  const platforms = await Platform.find({ organization: organization._id }).sort({
    createdAt: -1,
  });
  sendSuccess(res, 200, "Platforms retrieved", {
    platforms: platforms.map(toPublicPlatform),
  });
});

/** GET /api/platforms/:id — fetch a single platform. */
export const getPlatform = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const platform = await findPlatformOr404(req.params.id as string, organization._id);
  sendSuccess(res, 200, "Platform retrieved", {
    platform: toPublicPlatform(platform),
  });
});

/** POST /api/platforms — create a platform. */
export const createPlatform = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  if (!user || !organization) {
    throw new AppError("Authentication required", 401);
  }

  const body = req.body as CreatePlatformInput;

  const existing = await Platform.findOne({
    slug: body.slug,
    organization: organization._id,
  });
  if (existing) {
    throw new AppError("A platform with this slug already exists", 409);
  }

  const platform = await Platform.create({
    ...body,
    organization: organization._id,
    user: user._id,
  });
  emitBusinessDataChanged({
    source: "platform",
    action: "create",
    triggeredBy: user._id.toString(),
  });
  sendSuccess(res, 201, "Platform created", {
    platform: toPublicPlatform(platform),
  });
});

/** PUT /api/platforms/:id — update a platform. */
export const updatePlatform = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  if (!user || !organization) {
    throw new AppError("Authentication required", 401);
  }

  const body = req.body as UpdatePlatformInput;
  const platform = await findPlatformOr404(req.params.id as string, organization._id);

  // Guard slug uniqueness only when the slug is actually changing.
  if (body.slug && body.slug !== platform.slug) {
    const duplicate = await Platform.findOne({
      slug: body.slug,
      organization: organization._id,
      _id: { $ne: platform._id },
    });
    if (duplicate) {
      throw new AppError("A platform with this slug already exists", 409);
    }
  }

  Object.assign(platform, body);
  await platform.save();

  emitBusinessDataChanged({
    source: "platform",
    action: "update",
    triggeredBy: user._id.toString(),
  });
  sendSuccess(res, 200, "Platform updated", {
    platform: toPublicPlatform(platform),
  });
});

/** DELETE /api/platforms/:id — remove a platform. */
export const deletePlatform = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  if (!user || !organization) {
    throw new AppError("Authentication required", 401);
  }

  const platform = await findPlatformOr404(req.params.id as string, organization._id);

  // Prevent orphaning billing records — block deletion while any reference it.
  const referencingRecord = await Billing.exists({
    platform: platform._id,
    organization: organization._id,
  });
  if (referencingRecord) {
    throw new AppError(
      "This platform cannot be deleted because billing records are associated with it.",
      409
    );
  }

  await platform.deleteOne();
  emitBusinessDataChanged({
    source: "platform",
    action: "delete",
    triggeredBy: user._id.toString(),
  });
  sendSuccess(res, 200, "Platform deleted", { id: platform._id.toString() });
});
